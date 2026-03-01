"use strict";
/**
 * 思考の同期システム (TypeScript Version)
 */
/**
 * メインロジック
 */
function processVoiceMemosCombined() {
    const inputFolder = DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID);
    const outputFolder = DriveApp.getFolderById(CONFIG.OUTPUT_FOLDER_ID);
    const archiveFolder = DriveApp.getFolderById(CONFIG.ARCHIVE_FOLDER_ID);
    const files = inputFolder.getFilesByType(MimeType.PLAIN_TEXT);
    // 1. 全ファイルのテキストを収集・結合
    const { combinedText, fileList } = concateTexts(files);
    if (!combinedText.length) {
        const msg = '処理対象なし';
        console.log(msg);
        notifySlack(msg);
        return;
    }
    try {
        console.log(`${fileList.length}件のファイルを処理中...`);
        // 2. AIによる構造化
        const response = callGemini(combinedText);
        // 3. パース処理
        const titleMatch = response.match(/【TITLE_START】(.*?)【TITLE_END】/);
        const bodyMatch = response.match(/【BODY_START】([\s\S]*?)【BODY_END】/);
        if (!titleMatch || !bodyMatch)
            throw new Error('レスポンス形式のパースに失敗しました。');
        const title = titleMatch[1].trim();
        const body = bodyMatch[1].trim();
        // 4. 保存
        const dateStr = Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyyMMdd');
        const safeTitle = title.replace(/[\\/:*?"<>|]/g, '-');
        const fileName = `${dateStr}_${safeTitle}.md`;
        outputFolder.createFile(fileName, body, MimeType.PLAIN_TEXT);
        // 5. 後処理
        fileList.forEach(file => file.moveTo(archiveFolder));
        const successMsg = `✅ 作成成功: ${fileName} (元ファイル数: ${fileList.length})`;
        console.log(successMsg);
        notifySlack(successMsg);
    }
    catch (e) {
        const errorMsg = `❌ エラー発生: ${e.message}`;
        console.error(errorMsg);
        notifySlack(errorMsg);
    }
}
/**
 * GETリクエスト時に index.html をレンダリングする
 */
function doGet() {
    return HtmlService.createHtmlOutputFromFile('index')
        .setTitle('思考の同期')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
/**
 * HTML側の google.script.run から呼ばれる実行関数
 */
function runProcess() {
    processVoiceMemosCombined();
    return 'Success';
}
