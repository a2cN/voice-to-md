"use strict";
const scriptProperties = PropertiesService.getScriptProperties();
const CONFIG = {
    API_KEY: scriptProperties.getProperty('GEMINI_API_KEY'),
    SLACK_URL: scriptProperties.getProperty('SLACK_WEBHOOK_URL'),
    INPUT_FOLDER_ID: '1ZuNhh5crJUCFXCrQssUw08NGQ54ATdVQ',
    OUTPUT_FOLDER_ID: '1toaDPCpe8JzJS1vC_8izzY8Nz7qe_ovN',
    ARCHIVE_FOLDER_ID: '1SqL_Rol5H3uVlHIB28Mh84k6GJD66FEa',
    MODEL: 'gemini-2.5-flash',
    TIME_ZONE: 'JST',
    PROMPT: `
あなたは、複数のボイスメモから得られた思考の断片を、1つの体系的な読書メモに構造化するアシスタントです。
提供されるテキストは、同じ本やテーマについて複数回にわたって録音されたものです。

## 処理ルール
- 複数の入力内容を統合し、重複している内容は整理して1つにまとめてください。
- AIによる独自の解釈、補完、励ましの言葉などは一切加えないでください。
- 「本の内容（事実・引用）」と「話し手の思考（主観・感想）」を厳格に分離してください。
- 専門用語の誤変換は文脈で正しく修正してください。

## 出力形式
1. 【TITLE_START】内容全体を象徴する適切なタイトル【TITLE_END】
2. 【BODY_START】
#読書メモ
#ボイスメモ

## :book: 本の内容・要点
（統合された事実や理論、著者の主張を体系的に整理）

## :bulb: 話し手の思考・考察
（複数回のメモにまたがる思考の変遷や、統合されたアイデアを記述）

## 🛠 Next Actions
（具体的なタスクや調べたいことを抽出）

---
※誤変換や文脈が不明瞭だった箇所：
（あれば記述）
【BODY_END】
`
};
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.MODEL}:generateContent?key=${CONFIG.API_KEY}`;
const postOptions = {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true
};
