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
  if (!detections || detections.length === 0) return {};

  // 画像の寸法を取得（最初の検出結果から推定）
  const imageBounds = detections[0].boundingPoly?.vertices || [];
  const imageWidth = Math.max(...imageBounds.map(v => v.x || 0));
  const imageHeight = Math.max(...imageBounds.map(v => v.y || 0));

  // グリッドの定義（5行4列）
  const gridRows = 5;
  const gridCols = 4;
  const cellHeight = imageHeight / (gridRows + 2); // 上下のマージンを考慮
  const cellWidth = imageWidth / gridCols;

  // 各検出テキストを座標に基づいて分類
  const gridData = {};
  
  // スキップする要素（最初の要素は全体テキスト）
  for (let i = 1; i < detections.length; i++) {
    const detection = detections[i];
    const text = detection.description;
    const vertices = detection.boundingPoly?.vertices || [];
    
    if (vertices.length === 0) continue;
    
    // 中心座標を計算
    const centerX = vertices.reduce((sum, v) => sum + (v.x || 0), 0) / vertices.length;
    const centerY = vertices.reduce((sum, v) => sum + (v.y || 0), 0) / vertices.length;
    
    // どのセルに属するか判定
    const col = Math.floor(centerX / cellWidth);
    const row = Math.floor((centerY - cellHeight * 0.5) / cellHeight); // 上部マージンを考慮
    
    // 数値のみを抽出
    const numMatch = text.match(/\d+/);
    if (numMatch) {
      const value = parseInt(numMatch[0]);
      const key = `${row}_${col}`;
      
      // 同じセルに複数の数値がある場合は、より大きい数値を優先
      if (!gridData[key] || value > gridData[key].value) {
        gridData[key] = {
          value: value,
          text: text,
          row: row,
          col: col,
          x: centerX,
          y: centerY
        };
      }
    }
  }

  // 特別な処理：対象ゲーム数を探す
  let targetGameCount = null;
  
  // fullTextAnnotationから「対象ゲーム数」の後の数字を探す
  if (fullTextAnnotation && fullTextAnnotation.text) {
    const targetMatch = fullTextAnnotation.text.match(/対象ゲーム数\s*(\d+)/);
    if (targetMatch) {
      targetGameCount = parseInt(targetMatch[1]);
    }
  }

  // グリッドデータから構造化データを作成
  const structuredResult = {
    targetGameCount: targetGameCount,
    gridData: gridData,
    debug: {
      imageWidth: imageWidth,
      imageHeight: imageHeight,
      cellWidth: cellWidth,
      cellHeight: cellHeight,
      detectionCount: detections.length - 1
    }
  };

  // フィールドマッピングに基づいて値を抽出
  const fieldMapping = {
    X: { row: -1, col: -1, special: 'targetGameCount' }, // 特別処理
    A: { row: 1, col: 0 }, // 打込
    B: { row: 1, col: 1 }, // 2穴
    C: { row: 1, col: 2 }, // リプレイ
    D: { row: 1, col: 3 }, // リプ→V
    E: { row: 2, col: 0 }, // 羽根拾
    F: { row: 2, col: 1 }, // V入賞
    G: { row: 2, col: 2 }, // SP
    H: { row: 2, col: 3 }, // SP→V
    I: { row: 3, col: 0 }, // 拾い→蹴り
    J: { row: 3, col: 1 }, // 当大
    K: { row: 3, col: 2 }, // 当中
    L: { row: 3, col: 3 }, // 当小
    M: { row: 4, col: 0 }  // 2穴二回目
  };

  const extractedValues = {};
  
  // 対象ゲーム数（特別処理）
  if (targetGameCount !== null) {
    extractedValues.X = targetGameCount;
  }
  
  // その他のフィールド
  for (const [field, position] of Object.entries(fieldMapping)) {
    if (field === 'X') continue; // 既に処理済み
    
    const key = `${position.row}_${position.col}`;
    if (gridData[key]) {
      extractedValues[field] = gridData[key].value;
    }
  }

  structuredResult.extractedValues = extractedValues;
  
  return structuredResult;
}
