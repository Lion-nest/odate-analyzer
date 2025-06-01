const vision = require('@google-cloud/vision');

// Google Vision APIクライアントを初期化
const client = new vision.ImageAnnotatorClient({
  credentials: JSON.parse(process.env.GOOGLE_VISION_CREDENTIALS)
});

exports.handler = async (event, context) => {
  // CORSヘッダー
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // OPTIONSリクエストへの対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // POSTメソッドのみ許可
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // リクエストボディから画像データを取得
    const { image } = JSON.parse(event.body);
    
    if (!image) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No image data provided' })
      };
    }

    // Google Vision APIで画像を解析
    const [result] = await client.textDetection({
      image: {
        content: image
      },
      imageContext: {
        languageHints: ['ja', 'en']
      }
    });

    const detections = result.textAnnotations;
    const fullTextAnnotation = result.fullTextAnnotation;

    if (!detections || detections.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          text: '',
          message: 'No text found in the image',
          structuredData: {}
        })
      };
    }

    // 構造化データを抽出
    const structuredData = extractStructuredData(detections, fullTextAnnotation);

    // 全体のテキストと詳細な位置情報を返す
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        text: detections[0].description || '',
        fullTextAnnotation: fullTextAnnotation,
        detections: detections.slice(1), // 最初の要素は全体テキストなので除外
        structuredData: structuredData // 解析済みの構造化データ
      })
    };

  } catch (error) {
    console.error('OCR Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to process image',
        message: error.message 
      })
    };
  }
};

// 構造化データを抽出する関数
function extractStructuredData(detections, fullTextAnnotation) {
  if (!fullTextAnnotation || !fullTextAnnotation.text) return {};

  const fullText = fullTextAnnotation.text;
  console.log('Full OCR text:', fullText);

  // 改行や余分な空白を正規化
  const normalizedText = fullText.replace(/\s+/g, ' ').trim();
  console.log('Normalized text:', normalizedText);

  const extractedValues = {};

  // 各フィールドの抽出パターン
  // 対象ゲーム数の抽出
  const targetGameMatch = normalizedText.match(/対象ゲーム数\s*(\d+)/);
  if (targetGameMatch) {
    extractedValues.X = parseInt(targetGameMatch[1]);
  }

  // 数値の配列を作成（順序を保持）
  const allNumbers = [];
  const numberMatches = normalizedText.matchAll(/\d+/g);
  for (const match of numberMatches) {
    allNumbers.push({
      value: parseInt(match[0]),
      index: match.index,
      text: match[0]
    });
  }
  console.log('All numbers found:', allNumbers);

  // キーワードとその位置を探す
  const keywords = {
    '打込': { field: 'A', found: false, index: -1 },
    '2穴': { field: 'B', found: false, index: -1 },
    'リプレイ': { field: 'C', found: false, index: -1 },
    'リプ': { field: 'D', found: false, index: -1 }, // リプ→V
    '羽根拾': { field: 'E', found: false, index: -1 },
    'V入賞': { field: 'F', found: false, index: -1 },
    'SP→V': { field: 'H', found: false, index: -1 },
    'SP': { field: 'G', found: false, index: -1 }, // SP→Vより後に検索
    '蹴り': { field: 'I', found: false, index: -1 },
    '10R': { field: 'J', found: false, index: -1 },
    '5R': { field: 'K', found: false, index: -1 },
    '3R': { field: 'L', found: false, index: -1 },
    '2開放目': { field: 'M', found: false, index: -1 }
  };

  // キーワードの位置を検索
  for (const [keyword, info] of Object.entries(keywords)) {
    const keywordIndex = normalizedText.indexOf(keyword);
    if (keywordIndex !== -1) {
      info.found = true;
      info.index = keywordIndex;
    }
  }

  // 特別な処理：対象ゲーム数の後の数値群（A, B, C, D）
  if (targetGameMatch && targetGameMatch.index !== undefined) {
    const afterTargetIndex = targetGameMatch.index + targetGameMatch[0].length;
    const numbersAfterTarget = allNumbers.filter(n => n.index > afterTargetIndex).slice(0, 4);
    
    if (numbersAfterTarget.length >= 4) {
      extractedValues.A = numbersAfterTarget[0].value; // 打込
      extractedValues.B = numbersAfterTarget[1].value; // 2穴
      extractedValues.C = numbersAfterTarget[2].value; // リプレイ
      extractedValues.D = numbersAfterTarget[3].value; // リプ→V
    }
  }

  // 羽根拾の前の数値群（E, F, G, H）
  const haneIndex = normalizedText.indexOf('羽根拾');
  if (haneIndex !== -1) {
    const numbersBeforeHane = allNumbers.filter(n => n.index < haneIndex).slice(-4);
    if (numbersBeforeHane.length >= 4) {
      extractedValues.E = numbersBeforeHane[0].value; // 羽根拾
      extractedValues.F = numbersBeforeHane[1].value; // V入賞
      extractedValues.G = numbersBeforeHane[2].value; // SP
      extractedValues.H = numbersBeforeHane[3].value; // SP→V
    }
  }

  // 蹴りの前の数値群（I, J, K, L）
  const keriIndex = normalizedText.indexOf('蹴り');
  if (keriIndex !== -1) {
    const numbersBeforeKeri = allNumbers.filter(n => n.index < keriIndex).slice(-4);
    if (numbersBeforeKeri.length >= 4) {
      extractedValues.I = numbersBeforeKeri[0].value; // 拾い→蹴り
      extractedValues.J = numbersBeforeKeri[1].value; // 10R
      extractedValues.K = numbersBeforeKeri[2].value; // 5R
      extractedValues.L = numbersBeforeKeri[3].value; // 3R
    }
  }

  // 2開放目（Mの値）- 「2穴」の文字の前方向に6個目の数値
  const nianaIndex = normalizedText.lastIndexOf('2穴');
  if (nianaIndex !== -1) {
    const numbersBeforeNiana = allNumbers.filter(n => n.index < nianaIndex);
    if (numbersBeforeNiana.length >= 6) {
      extractedValues.M = numbersBeforeNiana[numbersBeforeNiana.length - 6].value;
    }
  }

  // 数値範囲によるバリデーション
  const ranges = {
    X: [0, 3000],
    A: [0, 300],
    B: [0, 150],
    C: [0, 100],
    D: [0, 100],
    E: [0, 1000],
    F: [0, 100],
    G: [0, 100],
    H: [0, 100],
    I: [0, 800],
    J: [0, 100],
    K: [0, 100],
    L: [0, 100],
    M: [0, 100]
  };

  // 範囲外の値を除外
  for (const [field, [min, max]] of Object.entries(ranges)) {
    if (extractedValues[field] !== undefined) {
      if (extractedValues[field] < min || extractedValues[field] > max) {
        console.log(`Field ${field} value ${extractedValues[field]} is out of range [${min}, ${max}]`);
        delete extractedValues[field];
      }
    }
  }

  return {
    extractedValues: extractedValues,
    debug: {
      normalizedText: normalizedText.substring(0, 200) + '...',
      numberCount: allNumbers.length,
      extractedCount: Object.keys(extractedValues).length
    }
  };
}
