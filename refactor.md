### 改善案

- github actions によるリリースバージョン管理

  - リリースを自動化するやつ, package.json とかを自動で書き換えるのかな？

- ファイル名の変更

  - background 系はよくなさそう。そのファイルが純粋な tracer, colloector である。
  - 今の tracer.ts と衝突するので要検討。例えば index.ts か processTracer とかの名前の方がいいかも？

- archteture.md を更新

- テストを作成

  - せっかくクラスベースにしたので、スイートな部分だけでいいのでテストしたい
  - demo.yml でテストを実行するようにして検証も兼ねる
  - checkout の後に metrics とっているけど順番入れ替え

- gihtub actions への登録
