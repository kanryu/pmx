## pmx - PMXファイルをparseし、JSON形式で吐き出すパーサ

PMXとはMMDのモデル形式PMDから派生した3Dモデル用ファイルフォーマットで、PMXEditor等でサ
http://kkhk22.seesaa.net/category/14045227-1.html

本ライブラリはPMXのモデルデータを解析し、他のモデル形式にコンバートしたり、
ブラウザ上で直接取り扱えるようにするために開発されたpure JavaScript実装のパーサです。

テストデータとして艦これの赤城を正常に解析できることを確認しています。

 * http://www.nicovideo.jp/watch/sm21842536
 * http://ux.getuploader.com/bla001/

### 質問やバグレポート

 * e-mail: k.kanryu@gmail.com
 * twitter: @junzabroP

他のPMXモデルで解析できないモデルがあればURL付きでお知らせいただけると助かります。

## ToDo

まだ nodejs前提の実装になっているのでモダンブラウザに対応させる必要あり。

## GitHub に関する情報

ソースコードはこちらで入手できます。 http://github.com/kanryu/pmx
あなたはソースツリーをくろーんしたり、最新版のtarballをダウンロードできます。


## ライセンス

 Copyright 2014 KATO Kanryu

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
