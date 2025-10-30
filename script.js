class MaskVisualization {
    constructor() {
        this.originalImage = null;          // 原始圖像
        this.maskImage = null;              // 遮罩圖像
        this.whitePixels = [];              // 白色像素陣列
        this.animationPixels = [];          // 動畫像素陣列
        this.isAnimating = false;           // 動畫狀態
        this.animationProgress = 0;         // 動畫進度
        this.animationDuration = 8000;      // 最大動畫時長（8秒）
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
    }

    setupEventListeners() {
        this.imageInput.addEventListener('change', () => this.checkInputs());
        this.maskInput.addEventListener('change', () => this.checkInputs());
        this.processBtn.addEventListener('click', () => this.processImages());
        this.playBtn.addEventListener('click', () => this.playAnimation());
        this.pauseBtn.addEventListener('click', () => this.pauseAnimation());
        this.resetBtn.addEventListener('click', () => this.resetAnimation());
        this.progressSlider.addEventListener('input', (e) => this.seekAnimation(e.target.value));
    }

    checkInputs() {
        const hasImage = this.imageInput.files.length > 0;
        const hasMask = this.maskInput.files.length > 0;
        this.processBtn.disabled = !(hasImage && hasMask);
    }

    async processImages() {
        try {
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
        const threshold = 200; // 將 RGB > 200 的像素視為白色
        
        for (let y = 0; y < tempCanvas.height; y++) {
            for (let x = 0; x < tempCanvas.width; x++) {
                const index = (y * tempCanvas.width + x) * 4;
                const r = maskData.data[index];
                const g = maskData.data[index + 1];
                const b = maskData.data[index + 2];
                
                if (r > threshold && g > threshold && b > threshold) {
                    this.whitePixels.push({ x, y });
                }
            }
        }
        
        // 排序像素：由上至下，由左至右
        this.whitePixels.sort((a, b) => {
            if (a.y !== b.y) return a.y - b.y;
            return a.x - b.x;
        });
        
        // 更新統計資料
        const totalPixels = tempCanvas.width * tempCanvas.height;
        const ratio = (this.whitePixels.length / totalPixels * 100).toFixed(2);
        
        document.getElementById('whitePixelCount').textContent = this.whitePixels.length.toLocaleString();
        document.getElementById('totalPixelCount').textContent = totalPixels.toLocaleString();
        document.getElementById('pixelRatio').textContent = ratio + '%';
    }

    createOverlay() {
        // 繪製原始圖像
        this.mainCtx.drawImage(this.originalImage, 0, 0, this.mainCanvas.width, this.mainCanvas.height);
        
        // 創建紅色半透明像素疊加
        const imageData = this.mainCtx.getImageData(0, 0, this.mainCanvas.width, this.mainCanvas.height);
        
        this.whitePixels.forEach(pixel => {
            const index = (pixel.y * this.mainCanvas.width + pixel.x) * 4;
            // 透明度混合紅色（50% 透明度）
            imageData.data[index] = Math.min(255, imageData.data[index] * 0.5 + 255 * 0.5);     // R
            imageData.data[index + 1] = Math.min(255, imageData.data[index + 1] * 0.5);         // G
            imageData.data[index + 2] = Math.min(255, imageData.data[index + 2] * 0.5);         // B
        });
        
        this.mainCtx.putImageData(imageData, 0, 0);
    }

    prepareAnimation() {
        // 計算最佳方陣尺寸
        const pixelCount = this.whitePixels.length;
        const aspectRatio = this.mainCanvas.width / this.mainCanvas.height;
        
        // 嘗試在方陣中維持長寬比
        let cols = Math.ceil(Math.sqrt(pixelCount * aspectRatio));
        let rows = Math.ceil(pixelCount / cols);
        
        // 如有需要則調整
        while (cols * rows < pixelCount) {
            if (cols <= rows) cols++;
            else rows++;
        }
        
        this.gridSize = { width: cols, height: rows };
        
        // 計算方陣位置（在畫布中央）
        const gridPixelSize = 6; // 每個方陣像素的大小
        const gridSpacing = 2;   // 方陣像素間的間距
        const totalGridWidth = cols * (gridPixelSize + gridSpacing) - gridSpacing;
        const totalGridHeight = rows * (gridPixelSize + gridSpacing) - gridSpacing;
        
        this.gridStartPos = {
            x: (this.mainCanvas.width - totalGridWidth) / 2,
            y: (this.mainCanvas.height - totalGridHeight) / 2
        };
        
        // 創建帶有路徑的動畫像素
        this.animationPixels = this.whitePixels.map((pixel, index) => {
            const gridX = index % cols;
            const gridY = Math.floor(index / cols);
            
            const targetX = this.gridStartPos.x + gridX * (gridPixelSize + gridSpacing);
            const targetY = this.gridStartPos.y + gridY * (gridPixelSize + gridSpacing);
            
            return {
                startX: pixel.x,
                startY: pixel.y,
                targetX: targetX,
                targetY: targetY,
                currentX: pixel.x,
                currentY: pixel.y,
                delay: index * 0.02, // 錯開動畫
                size: gridPixelSize
            };
        });
        
        // 根據像素數量調整動畫時長
        this.animationDuration = Math.min(10000, Math.max(3000, this.whitePixels.length * 2));
    }

    playAnimation() {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        this.playBtn.disabled = true;
        this.pauseBtn.disabled = false;
        this.resetBtn.disabled = false;
        
        const startTime = Date.now() - (this.animationProgress * this.animationDuration);
        
        const animate = () => {
            if (!this.isAnimating) return;
            
            const elapsed = Date.now() - startTime;
            this.animationProgress = Math.min(elapsed / this.animationDuration, 1);
            
            this.updateAnimation();
            this.drawAnimation();
            
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
        });
        
        this.drawAnimation();
        this.removeBoundingBox();
    }

    seekAnimation(value) {
        this.animationProgress = value / 100;
        this.updateAnimation();
        this.drawAnimation();
        this.progressText.textContent = Math.round(this.animationProgress * 100) + '%';
        
        if (this.animationProgress >= 1) {
            this.completeAnimation();
        } else {
            this.removeBoundingBox();
        }
    }

    updateAnimation() {
        this.animationPixels.forEach(pixel => {
            const pixelProgress = Math.max(0, Math.min(1, (this.animationProgress - pixel.delay) / (1 - pixel.delay)));
            const easedProgress = this.easeInOutCubic(pixelProgress);
            
            pixel.currentX = pixel.startX + (pixel.targetX - pixel.startX) * easedProgress;
            pixel.currentY = pixel.startY + (pixel.targetY - pixel.startY) * easedProgress;
        });
    }

    drawAnimation() {
        this.animationCtx.clearRect(0, 0, this.animationCanvas.width, this.animationCanvas.height);
        
        this.animationPixels.forEach(pixel => {
            this.animationCtx.fillStyle = 'rgba(255, 0, 0, 0.7)';
            this.animationCtx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
            this.animationCtx.lineWidth = 1;
            
            this.animationCtx.fillRect(
                Math.round(pixel.currentX - pixel.size/2),
                Math.round(pixel.currentY - pixel.size/2),
                pixel.size,
                pixel.size
            );
            
            this.animationCtx.strokeRect(
                Math.round(pixel.currentX - pixel.size/2),
                Math.round(pixel.currentY - pixel.size/2),
                pixel.size,
                pixel.size
            );
        });
    }

    completeAnimation() {
        this.isAnimating = false;
        this.playBtn.disabled = false;
        this.pauseBtn.disabled = true;
        this.drawBoundingBox();
    }

    drawBoundingBox() {
        if (this.animationPixels.length === 0) return;
        
        // 計算邊界框
        const minX = Math.min(...this.animationPixels.map(p => p.targetX - p.size/2));
        const maxX = Math.max(...this.animationPixels.map(p => p.targetX + p.size/2));
        const minY = Math.min(...this.animationPixels.map(p => p.targetY - p.size/2));
        const maxY = Math.max(...this.animationPixels.map(p => p.targetY + p.size/2));
        
        const padding = 10;
        
        this.animationCtx.strokeStyle = '#ff4444';
        this.animationCtx.lineWidth = 3;
        this.animationCtx.strokeRect(
            minX - padding,
            minY - padding,
            maxX - minX + padding * 2,
            maxY - minY + padding * 2
        );
        
        // Draw ratio label
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
        const canvas = this.chartCanvas;
        const ctx = this.chartCtx;
        
        canvas.width = 300;
        canvas.height = 300;
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 100;
        
        const totalPixels = this.mainCanvas.width * this.mainCanvas.height;
        const whitePixelRatio = this.whitePixels.length / totalPixels;
        const angle = whitePixelRatio * 2 * Math.PI;
        
        // 繪製背景圓圈
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#e0e0e0';
        ctx.fill();
        
        // 繪製白色像素部分
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, -Math.PI/2, -Math.PI/2 + angle);
        ctx.closePath();
        ctx.fillStyle = '#ff4444';
        ctx.fill();
        
        // 繪製標籤
        ctx.fillStyle = '#333';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${(whitePixelRatio * 100).toFixed(2)}%`, centerX, centerY + 5);
        
        ctx.font = '12px Arial';
        ctx.fillText('白色像素', centerX, centerY + 25);
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