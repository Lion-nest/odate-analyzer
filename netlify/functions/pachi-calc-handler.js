const vision = require('@google-cloud/vision');

// ★★★ ここから修正 ★★★
// 環境変数からJSON形式の認証情報を読み込む
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

// 読み込んだ認証情報を使って、Vision APIクライアントを初期化
const client = new vision.ImageAnnotatorClient({ credentials });
// ★★★ ここまで修正 ★★★


// テキストから日付と数値を抽出し、合計と詳細を返す関数
const parseVisionText = (text) => {
  // ... (これ以降のコードは前回のものと全く同じです) ...
  const results = {
    total: 0,
    details: []
  };
  if (!text) return results;

  const lines = text.split('\n');
  const dayMap = new Map(); // 重複した日付を避けるため

  for (const line of lines) {
    const match = line.match(/(本日|(\d+)日前)\s*(\d+)/);
    if (match) {
      const day = match[1];
      const value = parseInt(match[3], 10);
      if (!dayMap.has(day)) { // まだ登録されていない日付なら追加
        dayMap.set(day, value);
      }
    }
  }

  // 順番を整える（本日, 1日前, 2日前...）
  const sortedDays = ['本日', '1日前', '2日前', '3日前', '4日前', '5日前', '6日前'];
  for (const day of sortedDays) {
    if (dayMap.has(day)) {
      const value = dayMap.get(day);
      results.details.push({ day, value });
      results.total += value;
    }
  }
  
  // もし正規表現で1件もマッチしなかった場合のフォールバック
  if (results.total === 0) {
      const numbers = text.match(/\d+/g) || [];
      results.total = numbers
        .map(num => parseInt(num, 10))
        .filter(num => num > 0 && num < 5000)
        .reduce((a, b) => a + b, 0);
      results.details.push({ day: "フォールバック合計", value: results.total });
  }

  return results;
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { image1, image2 } = JSON.parse(event.body);

    const [responses1, responses2] = await Promise.all([
      client.textDetection({ image: { content: image1.split(',')[1] } }),
      client.textDetection({ image: { content: image2.split(',')[1] } })
    ]);

    const text1 = responses1[0].fullTextAnnotation?.text;
    const text2 = responses2[0].fullTextAnnotation?.text;

    let winsData, startsData;

    if (text1 && (text1.includes('大当り') || text1.includes('大当'))) {
      winsData = parseVisionText(text1);
      startsData = parseVisionText(text2);
    } else {
      startsData = parseVisionText(text1);
      winsData = parseVisionText(text2);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ winsData, startsData }),
    };

  } catch (error) {
    console.error('Error processing images:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '画像の処理中にエラーが発生しました。', details: error.message }),
    };
  }
};
