# TypeScript 型安全リファクタリング記録

**日付**: 2026-03-01
**対象プロジェクト**: voice-to-md（GAS + TypeScript）

---

## 📌 概要

`fetchJson` の戻り値の型を `Record<string, unknown>` から脱却させ、型ガード・ジェネリクス・Union Type を活用して型安全なコードにリファクタリングした。

---

## 🔄 リファクタリングの流れ

### 1. 型ガード（Type Guard）の正しい使い方

#### ❌ 間違い：呼び出すだけで結果を使わない

```typescript
if (code !== 200) {
  isGeminiError(body); // 呼んでいるだけ。型の絞り込みが発生しない
  throw new Error(`Gemini API Error: ${body.error.message}`);
}
```

- `isGeminiError(body)` の戻り値（boolean）をどこにも使っていない
- TypeScript は `body` の型を絞り込んでくれない
- `body.error.message` にアクセスするとコンパイルエラーになる

#### ✅ 正しい使い方：`if` 文の条件式で使う

```typescript
if (code !== 200) {
  if (!isGeminiError(body)) {
    throw new Error('Gemini API Error: Unknown error');
  }
  // ここでは body が GeminiErrorResponseBody と確定している！
  throw new Error(`Gemini API Error: ${body.error.message}`);
}
```

**学び**: 型ガード（`obj is Type`）は `if` 文の条件式の中で使って初めて、そのスコープ内での型を確定（**Type Narrowing / 型の絞り込み**）させる。

---

### 2. 型アサーション（`as`）の危うさ

#### 試したこと

```typescript
const errorBody = body as GeminiErrorResponse;
```

#### 起きたエラー

```
Conversion of type 'Record<string, unknown>' to type 'GeminiErrorResponse'
may be a mistake because neither type sufficiently overlaps with the other.
```

- `Record<string, unknown>` と `GeminiErrorResponse` の構造がかけ離れすぎていると、TypeScript は `as` すら拒否する
- `as unknown as GeminiErrorResponse` と2段階で通す方法もあるが、**型のごまかし**であり推奨されない
- **型アサーションは実行時のチェックを一切行わない**ので、想定外のデータが来たときにクラッシュする

**学び**: 外部API との通信のように**データの形が保証できない場面**では、`as` の決め打ちより型ガードによる実行時チェックが安全。

---

### 3. ジェネリクス（Generics）の導入

#### 課題

`FetchResult` の `body` を具体的な型にしたいが、`fetchJson` は Gemini API にも Slack Webhook にも使う汎用関数。特定の型に固定できない。

#### 解決策：型パラメータ `<T>` で呼び出し側に型を決めさせる

```typescript
// types.ts
interface FetchResult<T> {
  code: number;
  body: T;
}

// utils.ts - 関数の定義
const fetchJson = <T>(url: string, payload: object): FetchResult<T> => {
  // ...
  return {
    code: response.getResponseCode(),
    body: JSON.parse(response.getContentText()) as T,
  };
};

// 呼び出し側：型パラメータで body の型を指定
const { code, body } = fetchJson<GeminiApiResponse>(GEMINI_API_URL, payload);
// → body は GeminiApiResponse 型になる
```

**学び**: ジェネリクスは「**型を引数として受け取る**」仕組み。関数の汎用性を保ちつつ、呼び出し側で正確な型をつけられる。

---

### 4. Union Type で「成功 or エラー」を表現

```typescript
// types.ts
type GeminiApiResponse = GeminiResponseBody | GeminiErrorResponseBody;
```

- `fetchJson<GeminiApiResponse>(...)` と呼ぶことで、`body` は「成功レスポンスかエラーレスポンスのどちらか」という型になる
- 型ガード（`isGeminiError` / `isGeminiResponse`）を通すことで、どちらの型かを確定できる

**学び**: Union Type + 型ガードの組み合わせは、`as` を使わずに型を安全に絞り込む TypeScript の王道パターン。

---

### 5. ガード節（Early Return）パターン

#### ❌ ネストが深くなる書き方

```typescript
if (code !== 200) {
  if (isGeminiError(body)) {
    throw new Error(`Error: ${body.error.message}`);
  } else {
    throw new Error('Unknown error');
  }
} else {
  if (isGeminiResponse(body)) {
    return body.candidates[0].content.parts[0].text;
  } else {
    throw new Error('Unknown error');
  }
}
```

#### ✅ ガード節でフラットに書く

```typescript
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
```

**学び**: 「異常系を先に排除して `throw` する」ことで、正常系のコードがネストなしで書ける。型ガードとの相性が非常に良い。

---

### 6. 型ガード関数での配列チェック

#### ❌ 配列の要素アクセスを忘れる

```typescript
'content' in obj.candidates &&              // ← 配列自体に content はない
Array.isArray(obj.candidates.content.parts)  // ← クラッシュする
```

#### ✅ 配列の要素（[0]）にアクセスしてからチェック

```typescript
Array.isArray(obj.candidates) &&
obj.candidates.length > 0 &&
'content' in obj.candidates[0] &&            // ← [0] で最初の要素を取る
Array.isArray(obj.candidates[0].content.parts)
```

**学び**: 型ガード内では、**配列そのものと配列の要素は別物**。`Array.isArray` で確認した後、`length > 0` で空配列を除外し、`[0]` で中身にアクセスする。

---

## 📁 最終的なファイル構成

```
src/
├── types.ts      # 型定義（GeminiResponseBody, FetchResult<T>, CombinedFiles 等）
├── constants.ts  # 設定値、API URL、共通リクエストオプション
├── utils.ts      # ユーティリティ関数（fetchJson, notifySlack, callGemini, 型ガード）
└── script.ts     # メインロジック（processVoiceMemosCombined, doGet, runProcess）
```

---

## 💡 今後の課題・発展

- 型ガード関数の引数を `any` → `unknown` にできるとさらに厳密になる
- `catch (e)` の `e` も `unknown` 型なので、`instanceof Error` チェックを入れるとより安全
- Gemini API のレスポンス型を公式ドキュメントに合わせてより詳細に定義する
