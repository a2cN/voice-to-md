/**
 * テキストの収集・結合
 */
const concateTexts = (files: GoogleAppsScript.Drive.FileIterator): CombinedFiles => {
  let combinedText = '';
  const fileList: GoogleAppsScript.Drive.File[] = [];

  while (files.hasNext()) {
    const file = files.next();
    fileList.push(file);
    const content = file.getBlob().getDataAsString();
    combinedText += `\n--- 録音ファイル: ${file.getName()} ---\n${content}\n`;
  }
  return {
    combinedText,
    fileList
  };
}

/**
 * 外部API
 */
const fetchJson = <T>(url: string, payload: object): FetchResult<T> => {
  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    ...postOptions,
    payload: JSON.stringify(payload),
  };
  const response = UrlFetchApp.fetch(url, options);
  return {
    code: response.getResponseCode(),
    body: JSON.parse(response.getContentText()) as T
  };
};

/**
 * Slack通知
 */
const notifySlack = (message: string): void => {
  if (!CONFIG.SLACK_URL) return;
  UrlFetchApp.fetch(
    CONFIG.SLACK_URL, 
    {
      ...postOptions,
      payload: JSON.stringify({ text: message })
    }
  )
};


/**
 * Gemini API 呼び出し
 */
const callGemini = (content: string): string => {
  const payload = {
    contents: [{ parts: [{ text: `${CONFIG.PROMPT}\n\n結合された文字起こし原文:\n${content}` }] }]
  };

  const { code, body } = fetchJson<GeminiApiResponse>(GEMINI_API_URL, payload);
  if (code !== 200) {
    if (!isGeminiError(body)) {
        throw new Error('Gemini API Error: Unknown error');
    }
    throw new Error(`Gemini API Error: ${body.error.message}`);
  }
  if (!isGeminiResponse(body)) {
      throw new Error('Gemini API Error: Unknown error');
  }
  return body.candidates[0].content.parts[0].text;
};

function isGeminiError(obj: any): obj is GeminiErrorResponseBody {
    return obj &&
        typeof obj === 'object' &&
        'error' in obj &&
        typeof obj.error?.message === 'string';
}

function isGeminiResponse(obj: any): obj is GeminiResponseBody {
    return obj &&
        typeof obj === 'object' &&
        'candidates' in obj &&
        Array.isArray(obj.candidates) && 
        obj.candidates.length > 0 &&
        'content' in obj.candidates[0] &&
        Array.isArray(obj.candidates[0].content.parts) && 
        obj.candidates[0].content.parts.length > 0 &&
        'text' in obj.candidates[0].content.parts[0] &&
        typeof obj.candidates[0].content.parts[0].text === 'string';
}
