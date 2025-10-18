/**
 * Resizable Panels System
 * Handles drag-to-resize functionality for right sidebar and bottom panel
 */

class ResizablePanels {
    constructor() {
        this.isResizing = false;
        this.currentHandle = null;
        this.startX = 0;
        this.startY = 0;
        this.startWidth = 0;
        this.startHeight = 0;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSavedSizes();
    }

    setupEventListeners() {
        // Right sidebar resize handle
        const rightResizeHandle = document.querySelector('.right-sidebar .resize-handle-left');
        if (rightResizeHandle) {
            rightResizeHandle.addEventListener('mousedown', (e) => this.startResize(e, 'right'));
            // Double-click to reset to default width
            rightResizeHandle.addEventListener('dblclick', () => {
                const rightSidebar = document.querySelector('.right-sidebar');
                rightSidebar.style.width = '300px';
                this.saveSizes();
            });
        }

        // Bottom panel resize handle
        const bottomResizeHandle = document.querySelector('.bottom-panel .resize-handle-top');
        if (bottomResizeHandle) {
            bottomResizeHandle.addEventListener('mousedown', (e) => this.startResize(e, 'bottom'));
            // Double-click to reset to default height
            bottomResizeHandle.addEventListener('dblclick', () => {
                const bottomPanel = document.querySelector('.bottom-panel');
                bottomPanel.style.height = '200px';
                this.saveSizes();
            });
        }

        // Global mouse events
        document.addEventListener('mousemove', (e) => this.handleResize(e));
        document.addEventListener('mouseup', () => this.stopResize());
        
        // Keyboard shortcut to reset all panels (Ctrl+Shift+R)
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'R') {
                e.preventDefault();
                this.resetToDefaults();
            }
        });
        
        // Prevent text selection during resize
        document.addEventListener('selectstart', (e) => {
            if (this.isResizing) {
                e.preventDefault();
            }
        });
    }

    startResize(e, type) {
        e.preventDefault();
        this.isResizing = true;
        this.currentHandle = type;
        
        this.startX = e.clientX;
        this.startY = e.clientY;
        
        if (type === 'right') {
            const rightSidebar = document.querySelector('.right-sidebar');
            this.startWidth = parseInt(window.getComputedStyle(rightSidebar).width, 10);
            rightSidebar.querySelector('.resize-handle-left').classList.add('active');
        } else if (type === 'bottom') {
            const bottomPanel = document.querySelector('.bottom-panel');
            this.startHeight = parseInt(window.getComputedStyle(bottomPanel).height, 10);
            bottomPanel.querySelector('.resize-handle-top').classList.add('active');
        }
        
        document.body.style.cursor = type === 'right' ? 'ew-resize' : 'ns-resize';
        document.body.style.userSelect = 'none';
        
        // Add visual feedback
        document.body.classList.add('resizing');
        this.createSizeTooltip();
    }

    handleResize(e) {
        if (!this.isResizing) return;
        
        if (this.currentHandle === 'right') {
            this.resizeRightSidebar(e);
        } else if (this.currentHandle === 'bottom') {
            this.resizeBottomPanel(e);
        }
    }

    resizeRightSidebar(e) {
        const rightSidebar = document.querySelector('.right-sidebar');
        const deltaX = this.startX - e.clientX; // Inverted because we're resizing from the left edge
        const newWidth = this.startWidth + deltaX;
        
        // Apply constraints
        const minWidth = 200;
        const maxWidth = 600;
        const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        
        rightSidebar.style.width = constrainedWidth + 'px';
        this.updateSizeTooltip(`Width: ${constrainedWidth}px`, e.clientX, e.clientY);
    }

    resizeBottomPanel(e) {
        const bottomPanel = document.querySelector('.bottom-panel');
        const deltaY = this.startY - e.clientY; // Inverted because we're resizing from the top edge
        const newHeight = this.startHeight + deltaY;
        
        // Apply constraints
        const minHeight = 100;
        const maxHeight = 500;
        const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
        
        bottomPanel.style.height = constrainedHeight + 'px';
        this.updateSizeTooltip(`Height: ${constrainedHeight}px`, e.clientX, e.clientY);
    }

    stopResize() {
        if (!this.isResizing) return;
        
        this.isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // Remove visual feedback
        document.body.classList.remove('resizing');
        this.removeSizeTooltip();
        
        // Remove active class from handles
        document.querySelectorAll('.resize-handle').forEach(handle => {
            handle.classList.remove('active');
        });
        
        // Save the new sizes
        this.saveSizes();
        
        this.currentHandle = null;
    }

    saveSizes() {
        const rightSidebar = document.querySelector('.right-sidebar');
        const bottomPanel = document.querySelector('.bottom-panel');
        
        const sizes = {
            rightSidebarWidth: parseInt(window.getComputedStyle(rightSidebar).width, 10),
            bottomPanelHeight: parseInt(window.getComputedStyle(bottomPanel).height, 10)
        };
        
        localStorage.setItem('panelSizes', JSON.stringify(sizes));
    }

    loadSavedSizes() {
        const savedSizes = localStorage.getItem('panelSizes');
        if (!savedSizes) return;
        
        try {
            const sizes = JSON.parse(savedSizes);
            
            const rightSidebar = document.querySelector('.right-sidebar');
            const bottomPanel = document.querySelector('.bottom-panel');
            
            if (sizes.rightSidebarWidth && rightSidebar) {
                rightSidebar.style.width = sizes.rightSidebarWidth + 'px';
            }
            
            if (sizes.bottomPanelHeight && bottomPanel) {
                bottomPanel.style.height = sizes.bottomPanelHeight + 'px';
            }
        } catch (error) {
            console.warn('Failed to load saved panel sizes:', error);
        }
    }

    createSizeTooltip() {
        if (document.getElementById('resize-tooltip')) return;
        
        const tooltip = document.createElement('div');
        tooltip.id = 'resize-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            background: #333;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-family: monospace;
            z-index: 10000;
            pointer-events: none;
            opacity: 0.9;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(tooltip);
    }

    updateSizeTooltip(text, x, y) {
        const tooltip = document.getElementById('resize-tooltip');
        if (tooltip) {
            tooltip.textContent = text;
            tooltip.style.left = (x + 10) + 'px';
            tooltip.style.top = (y - 30) + 'px';
        }
    }

    removeSizeTooltip() {
        const tooltip = document.getElementById('resize-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }

    // Public method to reset panels to default sizes
    resetToDefaults() {
        const rightSidebar = document.querySelector('.right-sidebar');
        const bottomPanel = document.querySelector('.bottom-panel');
        
        if (rightSidebar) {
            rightSidebar.style.width = '300px';
        }
        
        if (bottomPanel) {
            bottomPanel.style.height = '200px';
        }
        
        this.saveSizes();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.resizablePanels = new ResizablePanels();
});

// Export for potential external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResizablePanels;
}