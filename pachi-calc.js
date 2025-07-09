document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('image-upload');
    const statusDiv = document.getElementById('status');
    const resultsDiv = document.getElementById('results');
    const totalWinsSpan = document.getElementById('total-wins');
    const totalStartsSpan = document.getElementById('total-starts');
    const probabilitySpan = document.getElementById('probability');

    imageUpload.addEventListener('change', async (event) => {
        const files = event.target.files;

        if (files.length !== 2) {
            statusDiv.textContent = '画像を2枚選択してください。';
            return;
        }

        statusDiv.textContent = '画像を解析中... (初回は時間がかかります)';
        resultsDiv.classList.add('hidden');

        try {
            const worker = await Tesseract.createWorker('jpn');

            const parseImage = async (file) => {
                const ret = await worker.recognize(file);
                const text = ret.data.text;
                
                let type = '';
                if (text.includes('大当り') || text.includes('大当')) {
                    type = 'wins';
                } else if (text.includes('総スタート') || text.includes('総ス')) {
                    type = 'starts';
                }

                const lines = text.split('\n');
                let total = 0;
                
                // 信頼できる行（例：「〇日前 123」）から数値を抽出
                const relevantLines = lines.filter(line => line.match(/日\s*前?\s*\d+$/));
                
                if(relevantLines.length > 0) {
                    total = relevantLines
                        .map(line => parseInt(line.match(/(\d+)$/)[0], 10))
                        .reduce((a, b) => a + b, 0);
                } else {
                    // フォールバック: テキスト全体からそれっぽい数字を合計
                    const numbers = text.match(/\d+/g) || [];
                    total = numbers
                        .map(num => parseInt(num, 10))
                        .filter(num => num < 5000) // 大きすぎる値を除外
                        .reduce((a, b) => a + b, 0);
                }

                return { type, total };
            };

            const [data1, data2] = await Promise.all([parseImage(files[0]), parseImage(files[1])]);
            await worker.terminate();

            const winsData = data1.type === 'wins' ? data1 : data2;
            const startsData = data1.type === 'starts' ? data1 : data2;

            if (!winsData.type || !startsData.type) {
                throw new Error('「大当り」と「総スタート」の画像を正しく認識できませんでした。');
            }

            const totalWins = winsData.total;
            const totalStarts = startsData.total;

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
