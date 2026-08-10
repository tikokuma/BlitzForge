# BlitzForge

BIGBIG WON Blitz2 の設定アプリを解析し、Tauri 2 + TypeScript + Rust で
一から作り直している非公式アプリです。

## BlitzForgeの特徴

- **高速起動**: コントローラー接続時の実測で、公式アプリの約8.05秒に対して
  BlitzForgeは約0.03秒でした（同じWindows環境で各5回測定）。
- **軽快なUI**: 設定画面の操作中に感じる待ち時間や引っかかりを大幅に減らし、
  公式アプリより軽快に操作できます。
- **安定した操作**: 手元での起動・編集・保存テストではクラッシュを確認して
  いません。ただし、すべての環境での無故障を保証するものではありません。

起動時間はプロセス起動からメインウィンドウ生成までの計測です。デバイス認識や
プロファイル読み込み完了までの時間とは異なります。

## できること

- v37 / 484バイトのプロファイル編集・保存
- スティック、キーバインド、連射、振動の設定
- ポーリングレート、ステップ精度の設定
- マクロスロットの読み書き
- 公式Shareコードの作成・読み込み
- プロファイルのコントローラーへの適用

主な対象は、次の設定用HIDインターフェースを持つ Blitz2 です。

- VID: 413D / PID: 2104
- Usage Page: 0xFF7A / Usage: 0x0001

Windows向けです。別機種・別ファームウェアでの動作は保証していません。
ファームウェア更新など一部の機能は未対応です。

## 注意

BlitzForgeはコントローラーへ設定を書き込みます。初めて使う前に、公式アプリ
の設定をバックアップしてください。実機の設定変更は自己責任で行ってください。

プロファイルは公式アプリと同じデータベースを使用します。

%PROGRAMDATA%\GamepadAssistant\Config.db

初回の書き込み前には、次の場所へバックアップを作成します。

%LOCALAPPDATA%\com.bigbigwon.lite\backups

通常の起動・編集・保存ではネットワーク通信を行いません。Shareコードを
使う場合だけ、公式アプリと互換性のあるShare APIへ設定データを送信します。

## 開発

必要なもの:

- Node.js / npm
- Rust toolchain
- Tauri 2 のWindowsビルド環境

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
├── docs/          解析資料
├── src/           TypeScript UI・ドメインロジック
├── src-tauri/     Rustバックエンド・Tauri設定
├── index.html
├── LICENSE
└── package.json
~~~

解析の詳細は次の資料を参照してください。

- [HIDプロトコル解析](docs/BIGBIGWON_HID_PROTOCOL.md)
- [再構築ログ](docs/BIGBIGWON_REBUILD_LOG.md)
- [プロファイル実装計画](docs/PROFILE_IMPLEMENTATION_PLAN.md)

## 非公式プロジェクトについて

BlitzForgeはBIGBIG WONおよびBlitz2の権利者とは無関係です。
製品名・ロゴなどの権利は各権利者に帰属します。

## ライセンス

MIT License
