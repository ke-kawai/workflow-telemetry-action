import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import resolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

export default [
  {
    input: 'src/entry/main.ts',
    output: {
      file: 'dist/main/index.js',
      format: 'cjs',
      sourcemap: true,
      inlineDynamicImports: true
    },
    plugins: [
      typescript({ tsconfig: './tsconfig.json' }),
      resolve({ preferBuiltins: true }),
      commonjs(),
      json()
    ]
  },
  {
    input: 'src/entry/post.ts',
    output: {
      file: 'dist/post/index.js',
      format: 'cjs',
      sourcemap: true,
      inlineDynamicImports: true
    },
    plugins: [
      typescript({ tsconfig: './tsconfig.json' }),
      resolve({ preferBuiltins: true }),
      commonjs(),
      json()
    ]
  },
  {
    input: 'src/features/stats/server.ts',
    output: {
      file: 'dist/scw/index.js',
      format: 'cjs',
      sourcemap: true,
      inlineDynamicImports: true
    },
    plugins: [
      typescript({ tsconfig: './tsconfig.json' }),
      resolve({ preferBuiltins: true }),
      commonjs(),
      json()
    ]
  }
]
