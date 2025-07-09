// Google Cloud Visionクライアントライブラリをインポート
const vision = require('@google-cloud/vision');

// クライアントを初期化します。
// Netlifyの環境変数に設定されたGoogleの認証情報が自動で使われます。
const client = new vision.ImageAnnotatorClient();

// テキストから数値を合計するヘルパー関数
const sumNumbersFromText = (text) => {
  if (!text) return 0;

  // テキストを行に分割
  const lines = text.split('\n');
  let total = 0;

  // 「本日」または「日前」で終わり、末尾に数字がある行を抽出
  const relevantLines = lines.filter(line => (line.includes('本日') || line.includes('日前')) && /\d+$/.test(line.trim()));

  if (relevantLines.length >= 7) {
    // 7日間データが正しく認識できた場合
    total = relevantLines
      .map(line => parseInt(line.match(/(\d+)$/)[0], 10))
      .reduce((a, b) => a + b, 0);
  } else {
    // うまく認識できなかった場合のフォールバック
    const numbers = text.match(/\d+/g) || [];
    total = numbers
      .map(num => parseInt(num, 10))
      .filter(num => num > 0 && num < 5000) // 0や極端に大きな値（日付やバッテリー等）を除外
      .reduce((a, b) => a + b, 0);
  }
  return total;
};


// Netlify Functionのメイン処理
exports.handler = async (event) => {
  // POSTリクエスト以外は弾く
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // フロントエンドから送られてきた画像データ（Base64）を取得
    const { image1, image2 } = JSON.parse(event.body);

    // 2枚の画像を並行してVision APIで解析
    const [responses1, responses2] = await Promise.all([
      client.textDetection({ image: { content: image1.split(',')[1] } }),
      client.textDetection({ image: { content: image2.split(',')[1] } })
    ]);

    const text1 = responses1[0].fullTextAnnotation?.text;
    const text2 = responses2[0].fullTextAnnotation?.text;
    
    let totalWins = 0;
    let totalStarts = 0;

    // どちらのテキストが「大当り」で「総スタート」かを判定
    if (text1 && (text1.includes('大当り') || text1.includes('大当'))) {
      totalWins = sumNumbersFromText(text1);
      totalStarts = sumNumbersFromText(text2);
    } else {
      totalWins = sumNumbersFromText(text2);
      totalStarts = sumNumbersFromText(text1);
    }
    
    // 計算結果をJSON形式でフロントエンドに返す
    return {
      statusCode: 200,
      body: JSON.stringify({ totalWins, totalStarts }),
    };

  } catch (error) {
    console.error('Error processing images:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '画像の処理中にエラーが発生しました。', details: error.message }),
    };
  }
};
