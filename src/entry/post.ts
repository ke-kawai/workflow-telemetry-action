import * as core from "@actions/core";
import * as github from "@actions/github";
import * as stepTracer from "../features/step/tracer";
import * as statCollector from "../features/stats/collector";
import * as processTracer from "../features/process/tracer";
import { Logger } from "../utils/logger";
import { WorkflowJobType } from "../interfaces";
import { loadPostConfig } from "../config/loader";

const logger = new Logger();

const PAGE_SIZE = 100;
const CURRENT_JOB_RETRY_COUNT = 10;
const CURRENT_JOB_RETRY_INTERVAL_MS = 1000;

const config = loadPostConfig();

const { pull_request } = github.context.payload;
const { workflow, job, repo, runId, sha } = github.context;
const octokit = github.getOctokit(config.github.token);

async function fetchJobPage(page: number): Promise<WorkflowJobType[]> {
  const result = await octokit.rest.actions.listJobsForWorkflowRun({
    owner: repo.owner,
    repo: repo.repo,
    run_id: runId,
    per_page: PAGE_SIZE,
    page,
  });
  return result.data.jobs;
}

async function findCurrentJob(): Promise<WorkflowJobType | null> {
  for (let page = 0; ; page++) {
    const jobs = await fetchJobPage(page);

    // If there are no jobs, stop here
    if (!jobs || !jobs.length) {
      break;
    }

    const currentJobs = jobs.filter(
      (it) =>
        it.status === "in_progress" &&
        it.runner_name === process.env.RUNNER_NAME
    );
    if (currentJobs && currentJobs.length) {
      return currentJobs[0] ?? null;
    }

    // Since returning job count is less than page size, this means that there are no other jobs.
    // So no need to make another request for the next page.
    if (jobs.length < PAGE_SIZE) {
      break;
    }
  }
  return null;
}

async function getCurrentJob(): Promise<WorkflowJobType | null> {
  try {
    for (let i = 0; i < CURRENT_JOB_RETRY_COUNT; i++) {
      const currentJob = await findCurrentJob();
      if (currentJob && currentJob.id) {
        return currentJob;
      }
      await new Promise((r) => setTimeout(r, CURRENT_JOB_RETRY_INTERVAL_MS));
    }
  } catch (error: unknown) {
    logger.error(
      error,
      `Unable to get current workflow job info. ` +
        `Please sure that your workflow have "actions:read" permission!`
    );
  }
  return null;
}

async function reportAll(
  currentJob: WorkflowJobType,
  content: string
): Promise<void> {
  logger.info(`Reporting all content ...`);

  logger.debug(`Workflow - Job: ${workflow} - ${job}`);

  const jobUrl = `https://github.com/${repo.owner}/${repo.repo}/runs/${currentJob.id}?check_suite_focus=true`;
  logger.debug(`Job url: ${jobUrl}`);

  const title = `## Workflow Telemetry - ${workflow} / ${currentJob.name}`;
  logger.debug(`Title: ${title}`);

  const commit: string =
    (pull_request && pull_request.head && pull_request.head.sha) || sha;
  logger.debug(`Commit: ${commit}`);

  const commitUrl = `https://github.com/${repo.owner}/${repo.repo}/commit/${commit}`;
  logger.debug(`Commit url: ${commitUrl}`);

  const postContent: string = [title, content].join("\n");

  if (config.report.jobSummary) {
    core.summary.addRaw(postContent);
    await core.summary.write();
  }

  if (pull_request && config.report.commentOnPR) {
    if (logger.isDebugEnabled()) {
      logger.debug(`Found Pull Request: ${JSON.stringify(pull_request)}`);
    }

    await octokit.rest.issues.createComment({
      ...github.context.repo,
      issue_number: Number(github.context.payload.pull_request?.number),
      body: postContent,
    });
  } else {
    logger.debug(`Couldn't find Pull Request`);
  }

  logger.info(`Reporting all content completed`);
}

async function run(): Promise<void> {
  try {
    logger.info(`Finishing ...`);

    const currentJob: WorkflowJobType | null = await getCurrentJob();

    if (!currentJob) {
      logger.error(
        new Error(`Couldn't find current job. So action will not report any data.`)
      );
      return;
    }

    logger.debug(`Current job: ${JSON.stringify(currentJob)}`);

    // Finish tracer and collector
    await stepTracer.finish(currentJob);
    await statCollector.finish(currentJob);
    await processTracer.finish(config.processTracer, currentJob);

    // Report tracer and collector
    const stepTracerContent: string | null = await stepTracer.report(
      currentJob
    );
    const stepCollectorContent: string | null = await statCollector.report(
      currentJob
    );
    const procTracerContent: string | null = await processTracer.report(
      config.processTracer,
      currentJob
    );

    // Aggregate all content and report
    let allContent = "";
    if (stepTracerContent) {
      allContent = allContent.concat(stepTracerContent, "\n");
    }
    if (stepCollectorContent) {
      allContent = allContent.concat(stepCollectorContent, "\n");
    }
    if (procTracerContent) {
      allContent = allContent.concat(procTracerContent, "\n");
    }
    await reportAll(currentJob, allContent);

    logger.info(`Finish completed`);
  } catch (error: unknown) {
    logger.error(error);
  }
}

run();
