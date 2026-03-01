interface GeminiResponseBody  {
    candidates: {
        content: {
            parts: { text: string }[];
        }
    }[];
}

interface GeminiErrorResponseBody {
    error: {
        message : string;
    }
}
type GeminiApiResponse = GeminiResponseBody | GeminiErrorResponseBody

interface FetchResult<T> {
    code: number;
    body: T;
}

interface CombinedFiles{
    combinedText: string,
    fileList: GoogleAppsScript.Drive.File[]
}