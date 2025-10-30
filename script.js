class MaskVisualization {
    constructor() {
        this.originalImage = null;          // 原始圖像
        this.maskImage = null;              // 遮罩圖像
        this.whitePixels = [];              // 黑色像素集合（沿用變數名以減少改動）
        this.animationPixels = [];          // 動畫像素陣列
        this.isAnimating = false;           // 動畫狀態
        this.animationProgress = 0;         // 動畫進度 [0,1]
        this.animationDuration = 8000;      // 最大動畫時長（<=10秒）
        this.gridSize = { width: 0, height: 0 };    // 方陣尺寸
        this.gridStartPos = { x: 0, y: 0 };         // 方陣起始位置
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.imageInput = document.getElementById('imageInput');
        this.maskInput = document.getElementById('maskInput');
        this.processBtn = document.getElementById('processBtn');
        this.playBtn = document.getElementById('playBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.progressSlider = document.getElementById('progressSlider');
        this.progressText = document.getElementById('progressText');
        this.mainCanvas = document.getElementById('mainCanvas');
        this.animationCanvas = document.getElementById('animationCanvas');
        this.chartCanvas = document.getElementById('chartCanvas');
        this.visualizationSection = document.querySelector('.visualization-section');
        
        this.mainCtx = this.mainCanvas.getContext('2d');
        this.animationCtx = this.animationCanvas.getContext('2d');
        this.chartCtx = this.chartCanvas.getContext('2d');

        // overlay 離屏畫布（基礎層＋可清除層）
        this.overlayBaseCanvas = document.createElement('canvas');
        this.overlayBaseCtx = this.overlayBaseCanvas.getContext('2d');
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        // 已就位像素的離屏畫布（避免完成後消失）
        this.settledCanvas = document.createElement('canvas');
        this.settledCtx = this.settledCanvas.getContext('2d');
    }

    setupEventListeners() {
        const recheck = () => this.checkInputs();
        this.imageInput.addEventListener('change', recheck);
        this.maskInput.addEventListener('change', recheck);
        this.imageInput.addEventListener('input', recheck);
        this.maskInput.addEventListener('input', recheck);
        this.processBtn.addEventListener('click', () => this.processImages());
        this.playBtn.addEventListener('click', () => this.playAnimation());
        this.pauseBtn.addEventListener('click', () => this.pauseAnimation());
        this.resetBtn.addEventListener('click', () => this.resetAnimation());
        this.progressSlider.addEventListener('input', (e) => this.seekAnimation(e.target.value));
        // 初始化檢查
        this.checkInputs();
    }

    checkInputs() {
        const hasImage = this.imageInput && this.imageInput.files && this.imageInput.files.length > 0;
        const hasMask = this.maskInput && this.maskInput.files && this.maskInput.files.length > 0;
        const enable = !!(hasImage && hasMask);
        this.processBtn.disabled = !enable;
        this.processBtn.title = enable ? '' : '請先選擇原始圖像與遮罩圖像';
    }

    async processImages() {
        try {
            const hasImage = this.imageInput && this.imageInput.files && this.imageInput.files.length > 0;
            const hasMask = this.maskInput && this.maskInput.files && this.maskInput.files.length > 0;
            if (!hasImage || !hasMask) {
                alert('請先選擇原始圖像與遮罩圖像');
                return;
            }

            this.originalImage = await this.loadImage(this.imageInput.files[0]);
            this.maskImage = await this.loadImage(this.maskInput.files[0]);
            
            this.setupCanvas();
            this.analyzeImages();
            this.createOverlay();
            this.prepareAnimation();
            this.drawChart();
            
            this.visualizationSection.style.display = 'block';
            this.enableControls();
            
        } catch (error) {
            console.error('處理圖像時發生錯誤:', error);
            alert('處理圖像時發生錯誤，請檢查檔案格式。');
        }
    }

    loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    setupCanvas() {
        const maxWidth = 800;
        const maxHeight = 600;
        
        let { width, height } = this.originalImage;
        
        // 如果圖像太大則縮小
        if (width > maxWidth || height > maxHeight) {
            const scale = Math.min(maxWidth / width, maxHeight / height);
            width *= scale;
            height *= scale;
        }
        
        this.mainCanvas.width = width;
        this.mainCanvas.height = height;
        this.animationCanvas.width = width;
        this.animationCanvas.height = height;
        
        this.mainCanvas.style.width = width + 'px';
        this.mainCanvas.style.height = height + 'px';
        this.animationCanvas.style.width = width + 'px';
        this.animationCanvas.style.height = height + 'px';
    }

    analyzeImages() {
        // 繪製圖像以獲取像素資料
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = this.mainCanvas.width;
        tempCanvas.height = this.mainCanvas.height;
        
        // 繪製並分析遮罩
        tempCtx.drawImage(this.maskImage, 0, 0, tempCanvas.width, tempCanvas.height);
        const maskData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        
        this.whitePixels = [];
        const threshold = 10; // 將 RGB <= 10 的像素視為黑色
        
        for (let y = 0; y < tempCanvas.height; y++) {
            for (let x = 0; x < tempCanvas.width; x++) {
                const index = (y * tempCanvas.width + x) * 4;
                const r = maskData.data[index];
                const g = maskData.data[index + 1];
                const b = maskData.data[index + 2];
                
                if (r <= threshold && g <= threshold && b <= threshold) {
                    this.whitePixels.push({ x, y });
                }
            }
        }
        
        // 排序像素：由上至下，由左至右
        this.whitePixels.sort((a, b) => {
            if (a.y !== b.y) return a.y - b.y;
            return a.x - b.x;
        });
        
        // 初始化統計：切割區域像素（飛到定位）先顯示 0
        const totalPixels = tempCanvas.width * tempCanvas.height;
        document.getElementById('whitePixelCount').textContent = '0';
        document.getElementById('totalPixelCount').textContent = totalPixels.toLocaleString();
        document.getElementById('pixelRatio').textContent = '0%';
    }

    createOverlay() {
        // 繪製原始圖像（保持清晰）
        this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
        this.mainCtx.drawImage(this.originalImage, 0, 0, this.mainCanvas.width, this.mainCanvas.height);

        // 建立 overlay 基礎層（紅色半透明標示黑像素）
        this.overlayBaseCanvas.width = this.mainCanvas.width;
        this.overlayBaseCanvas.height = this.mainCanvas.height;
        this.overlayCanvas.width = this.mainCanvas.width;
        this.overlayCanvas.height = this.mainCanvas.height;
        this.settledCanvas.width = this.mainCanvas.width;
        this.settledCanvas.height = this.mainCanvas.height;

        this.overlayBaseCtx.clearRect(0, 0, this.overlayBaseCanvas.width, this.overlayBaseCanvas.height);
        this.overlayBaseCtx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        for (const { x, y } of this.whitePixels) {
            this.overlayBaseCtx.fillRect(x, y, 1, 1);
        }
        // 初始化可清除層為基礎層拷貝
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        this.overlayCtx.drawImage(this.overlayBaseCanvas, 0, 0);
        // 初始化已就位層
        this.settledCtx.clearRect(0, 0, this.settledCanvas.width, this.settledCanvas.height);
    }

    prepareAnimation() {
        // 以畫布寬度為欄數，確保每列填滿後才換行
        const pixelCount = this.whitePixels.length;
        const cols = this.mainCanvas.width; // 每列包含與畫布寬度相同的像素數
        const rows = Math.ceil(pixelCount / cols);
        
        this.gridSize = { width: cols, height: rows };
        
        // 方陣從左上角開始，1×1 像素、無間距
        const gridPixelSize = 1; // 1×1 像素
        const gridSpacing = 0;   // 無間距，像素對齊
        
        this.gridStartPos = {
            x: 0,
            y: 0
        };
        
        // 單線隊列但「逐行依序」：一行完成後才進入下一行
        const n = Math.max(1, this.whitePixels.length);
        const rowSpan = 1 / Math.max(1, rows);            // 每一行的全域時間窗（占整體 1.0）
        const inRowMovePortion = 0.8;                      // 行內用於飛行的比例，剩餘作為行內延遲/緩衝
        const inRowDelayPortion = 1 - inRowMovePortion;    // 行內延遲（用於從左至右排隊）

        // 創建帶有路徑的動畫像素
        this.animationPixels = this.whitePixels.map((pixel, index) => {
            const gridX = index % cols;
            const gridY = Math.floor(index / cols);

            const targetX = this.gridStartPos.x + gridX * (gridPixelSize + gridSpacing);
            const targetY = this.gridStartPos.y + gridY * (gridPixelSize + gridSpacing);

            // 行起點時間 + 行內依列序的微延遲，確保整行先於下一行
            const rowStart = gridY * rowSpan;
            const perRowDelay = (cols > 1 ? (gridX / (cols - 1)) : 0) * (rowSpan * inRowDelayPortion);
            const delay = rowStart + perRowDelay;          // 僅到本行範圍內
            const duration = rowSpan * inRowMovePortion;   // 本行內的飛行時長

            return {
                startX: pixel.x,
                startY: pixel.y,
                targetX: targetX,
                targetY: targetY,
                currentX: pixel.x,
                currentY: pixel.y,
                delay: delay,
                duration: duration,
                size: gridPixelSize
            };
        });
        
        // 根據像素數量自動調整（<=10s）
        const baseDuration = 6000;
        this.animationDuration = Math.min(10000, baseDuration + Math.min(4000, Math.sqrt(n) * 50));
    }

    playAnimation() {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        this.playBtn.disabled = true;
        this.pauseBtn.disabled = false;
        this.resetBtn.disabled = false;
        
        // 以目前進度重建 overlay（避免每幀整張重繪）
        this.rebuildOverlayForProgress(this.animationProgress);
        
        const startTime = Date.now() - (this.animationProgress * this.animationDuration);
        
        const animate = () => {
            if (!this.isAnimating) return;
            
            const elapsed = Date.now() - startTime;
            this.animationProgress = Math.min(elapsed / this.animationDuration, 1);
            
            this.updateAnimation();
            this.drawAnimation();
            this.updateSettledStats();
            
            this.progressSlider.value = this.animationProgress * 100;
            this.progressText.textContent = Math.round(this.animationProgress * 100) + '%';
            
            if (this.animationProgress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.completeAnimation();
            }
        };
        
        requestAnimationFrame(animate);
    }

    pauseAnimation() {
        this.isAnimating = false;
        this.playBtn.disabled = false;
        this.pauseBtn.disabled = true;
    }

    resetAnimation() {
        this.isAnimating = false;
        this.animationProgress = 0;
        this.playBtn.disabled = false;
        this.pauseBtn.disabled = true;
        this.progressSlider.value = 0;
        this.progressText.textContent = '0%';
        
        // 重置像素位置
        this.animationPixels.forEach(pixel => {
            pixel.currentX = pixel.startX;
            pixel.currentY = pixel.startY;
            pixel.settled = false;
        });
        
        // 回到初始：完整 overlay
        this.rebuildOverlayForProgress(0);
        this.drawAnimation();
        this.updateSettledStats();
        this.removeBoundingBox();
    }

    seekAnimation(value) {
        this.animationProgress = value / 100;
        this.updateAnimation();
        // 依新進度重建 overlay，避免來回拖曳造成殘影或不一致
        this.rebuildOverlayForProgress(this.animationProgress);
        this.drawAnimation();
        this.updateSettledStats();
        this.progressText.textContent = Math.round(this.animationProgress * 100) + '%';
        
        if (this.animationProgress >= 1) {
            this.drawFinalGrid();
        } else {
            this.removeBoundingBox();
        }
    }

    updateAnimation() {
        this.animationPixels.forEach(pixel => {
            const denom = pixel.duration ? pixel.duration : (1 - pixel.delay);
            const pixelProgress = Math.max(0, Math.min(1, (this.animationProgress - pixel.delay) / denom));
            const t = pixelProgress; // 線性等速
            pixel.currentX = pixel.startX + (pixel.targetX - pixel.startX) * t;
            pixel.currentY = pixel.startY + (pixel.targetY - pixel.startY) * t;
        });
    }

    // 依指定進度重建 overlay：先拷貝基礎層，再把已起飛的像素清除
    rebuildOverlayForProgress(progress) {
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        this.overlayCtx.drawImage(this.overlayBaseCanvas, 0, 0);
        this.settledCtx.clearRect(0, 0, this.settledCanvas.width, this.settledCanvas.height);
        this.settledCtx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        for (const p of this.animationPixels) {
            const denom = p.duration ? p.duration : (1 - p.delay);
            const pixelProgress = Math.max(0, Math.min(1, (progress - p.delay) / denom));
            if (pixelProgress > 0) this.overlayCtx.clearRect(p.startX, p.startY, 1, 1);
            if (pixelProgress >= 1) {
                this.settledCtx.fillRect(Math.round(p.targetX), Math.round(p.targetY), 1, 1);
                p.settled = true;
            } else {
                p.settled = false;
            }
        }
        this.updateSettledStats();
    }

    // 即時更新切割區域像素（已就位數量）與比例
    updateSettledStats() {
        const settledCount = this.animationPixels.reduce((sum, p) => sum + (p.settled ? 1 : 0), 0);
        const totalPixels = this.mainCanvas.width * this.mainCanvas.height;
        document.getElementById('whitePixelCount').textContent = settledCount.toLocaleString();
        const ratio = (settledCount / totalPixels * 100).toFixed(2);
        document.getElementById('pixelRatio').textContent = ratio + '%';
        this.updateChart(settledCount);
    }

    // 畫出最終方陣（1×1 半透明紅色）
    drawFinalGrid() {
        // 將所有目標像素寫入已就位層，並呈現
        this.settledCtx.clearRect(0, 0, this.settledCanvas.width, this.settledCanvas.height);
        this.settledCtx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        for (const p of this.animationPixels) {
            this.settledCtx.fillRect(Math.round(p.targetX), Math.round(p.targetY), 1, 1);
            p.settled = true;
        }
        this.animationCtx.clearRect(0, 0, this.animationCanvas.width, this.animationCanvas.height);
        this.animationCtx.drawImage(this.settledCanvas, 0, 0);
        this.updateSettledStats();
    }

    drawAnimation() {
        this.animationCtx.clearRect(0, 0, this.animationCanvas.width, this.animationCanvas.height);
        
        // 逐幀僅清除「已起飛」像素；overlay 本身保持狀態（效能更佳）
        for (const p of this.animationPixels) {
            const denom = p.duration ? p.duration : (1 - p.delay);
            const pixelProgress = Math.max(0, Math.min(1, (this.animationProgress - p.delay) / denom));
            if (pixelProgress > 0) this.overlayCtx.clearRect(p.startX, p.startY, 1, 1);
        }
        // 畫 overlay 與已就位層在動畫層上
        this.animationCtx.drawImage(this.overlayCanvas, 0, 0);
        this.animationCtx.drawImage(this.settledCanvas, 0, 0);

        // 再畫飛行中的像素方塊（1×1，無描邊，避免色疊和卡頓）
        for (const pixel of this.animationPixels) {
            const denom = pixel.duration ? pixel.duration : (1 - pixel.delay);
            const progress = Math.max(0, Math.min(1, (this.animationProgress - pixel.delay) / denom));
            if (progress > 0 && progress < 1) {
                this.animationCtx.fillStyle = 'rgba(255, 0, 0, 0.9)';
                const x = Math.round(pixel.currentX);
                const y = Math.round(pixel.currentY);
                this.animationCtx.fillRect(x, y, 1, 1);
            } else if (progress >= 1 && !pixel.settled) {
                // 新完成的像素寫入已就位層
                this.settledCtx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                this.settledCtx.fillRect(Math.round(pixel.targetX), Math.round(pixel.targetY), 1, 1);
                pixel.settled = true;
            }
        }
    }

    completeAnimation() {
        this.isAnimating = false;
        this.playBtn.disabled = false;
        this.pauseBtn.disabled = true;
        this.drawFinalGrid();
    }

    drawBoundingBox() {
        if (this.animationPixels.length === 0) return;
        
        // 以循環計算邊界框，避免展開大量參數造成堆疊溢位
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of this.animationPixels) {
            const left = p.targetX;
            const right = p.targetX + 1;
            const top = p.targetY;
            const bottom = p.targetY + 1;
            if (left < minX) minX = left;
            if (right > maxX) maxX = right;
            if (top < minY) minY = top;
            if (bottom > maxY) maxY = bottom;
        }
        
        const padding = 10;
        
        this.animationCtx.strokeStyle = '#ff4444';
        this.animationCtx.lineWidth = 3;
        this.animationCtx.strokeRect(
            minX - padding,
            minY - padding,
            maxX - minX + padding * 2,
            maxY - minY + padding * 2
        );
        
        // 比例標籤（黑色像素）
        const ratio = (this.whitePixels.length / (this.mainCanvas.width * this.mainCanvas.height) * 100).toFixed(2);
        const labelText = `${ratio}%`;
        
        this.animationCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        this.animationCtx.fillRect(maxX + 15, minY - padding, 80, 30);
        
        this.animationCtx.fillStyle = '#333';
        this.animationCtx.font = '14px Arial';
        this.animationCtx.fillText(labelText, maxX + 25, minY - padding + 20);
    }

    removeBoundingBox() {
        // 邊界框每幀重繪，所以只需重繪而不包含邊界框
        this.drawAnimation();
    }

    drawChart() {
        // 初始化圓餅圖，先畫 0%
        const canvas = this.chartCanvas;
        const ctx = this.chartCtx;
        canvas.width = 300;
        canvas.height = 300;
        this.updateChart(0);
    }

    updateChart(settledCount) {
        const canvas = this.chartCanvas;
        const ctx = this.chartCtx;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 100;
        const totalPixels = this.mainCanvas.width * this.mainCanvas.height;
        const ratio = totalPixels > 0 ? (settledCount / totalPixels) : 0;
        const angle = ratio * 2 * Math.PI;
        // 清空
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 背景圓
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#e0e0e0';
        ctx.fill();
        // 占比扇形
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, -Math.PI/2, -Math.PI/2 + angle);
        ctx.closePath();
        ctx.fillStyle = '#ff4444';
        ctx.fill();
        // 文字
        ctx.fillStyle = '#333';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${(ratio * 100).toFixed(2)}%`, centerX, centerY + 5);
        ctx.font = '12px Arial';
        ctx.fillText('切割區域佔比', centerX, centerY + 25);
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    enableControls() {
        this.playBtn.disabled = false;
        this.resetBtn.disabled = false;
        this.progressSlider.disabled = false;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new MaskVisualization();
});