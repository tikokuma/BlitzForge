# BlitzForge

BIGBIG WON Blitz2向けの非公式Windows設定アプリです。
公式アプリと同じプロファイルを使い、コントローラーの設定を編集・保存・適用できます。

## 対応機器

- BIGBIG WON Blitz2
- Windows
- USB接続

別機種や別ファームウェアでは動作を保証していません。
ファームウェア更新には対応していません。

## できること

- スティックの曲線、デッドゾーン、安定化係数の設定
- キーバインドと連射の設定
- 振動とデバイス設定の変更
- マクロの読み書き
- ポーリングレートとステップ精度の設定
- プロファイルの保存とコントローラーへの適用
- 公式Shareコードの作成と読み込み

プロファイルは公式アプリと同じデータベースを使用します。
BlitzForgeで保存したプロファイルは、公式アプリでも認識できます。

## 注意

BlitzForgeはコントローラーへ設定を書き込みます。
初めて使う前に、公式アプリの設定をバックアップしてください。
実機の設定変更は自己責任で行ってください。

初回の書き込み前には、次の場所へバックアップを作成します。

`%LOCALAPPDATA%\\com.bigbigwon.lite\\backups`

通常の起動・編集・保存ではネットワーク通信を行いません。
Shareコードを使う場合だけ、公式アプリと互換性のあるShare APIへ設定データを送信します。

## 開発

必要なもの:

- Node.js / npm
- Rust toolchain
- Tauri 2のWindowsビルド環境

~~~powershell
npm install
npm run tauri dev
~~~

チェック:

~~~powershell
npm run check
~~~

配布用ビルド:

~~~powershell
npm run tauri build
~~~

## フォルダ構成

~~~text
.
├── src/           TypeScript UI・ドメインロジック
├── src-tauri/     Rustバックエンド・Tauri設定
├── index.html
├── LICENSE
└── package.json
~~~

## 非公式プロジェクトについて

BlitzForgeはBIGBIG WONおよびBlitz2の権利者とは無関係です。
製品名・ロゴなどの権利は各権利者に帰属します。

## ライセンス

MIT License
