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
        languageHints: ['ja', 'en'] // 日本語と英語を認識
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
          message: 'No text found in the image'
        })
      };
    }

    // 全体のテキストと詳細な位置情報を返す
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        text: detections[0].description || '',
        fullTextAnnotation: fullTextAnnotation,
        detections: detections.slice(1) // 最初の要素は全体テキストなので除外
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
