document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('image-upload');
    const statusDiv = document.getElementById('status');
    const resultsDiv = document.getElementById('results');
    const totalWinsSpan = document.getElementById('total-wins');
    const totalStartsSpan = document.getElementById('total-starts');
    const probabilitySpan = document.getElementById('probability');

    // ファイルをBase64形式に変換する関数
    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    imageUpload.addEventListener('change', async (event) => {
        const files = event.target.files;

        if (files.length !== 2) {
            statusDiv.textContent = '画像を2枚選択してください。';
            return;
        }

        statusDiv.textContent = '画像をアップロードし、解析中です...';
        resultsDiv.classList.add('hidden');

        try {
            // 2枚の画像をBase64形式に変換
            const [base64Image1, base64Image2] = await Promise.all([
                toBase64(files[0]),
                toBase64(files[1])
            ]);

            // バックエンド関数に画像を送信
            const response = await fetch('/.netlify/functions/pachi-calc-handler', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image1: base64Image1, image2: base64Image2 }),
            });

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || 'サーバーでエラーが発生しました。');
            }

            // バックエンドから計算結果を受け取る
            const { totalWins, totalStarts } = await response.json();

            totalWinsSpan.textContent = totalWins;
            totalStartsSpan.textContent = totalStarts;

            if (totalWins === 0) {
                probabilitySpan.textContent = '計算不能 (大当り0回)';
            } else {
                const A = (totalStarts / totalWins).toFixed(1);
                probabilitySpan.textContent = `1 / ${A}`;
            }

            statusDiv.textContent = '計算が完了しました。';
            resultsDiv.classList.remove('hidden');

        } catch (error) {
            console.error(error);
            statusDiv.textContent = `エラーが発生しました: ${error.message}`;
            resultsDiv.classList.add('hidden');
        }
    });
});
