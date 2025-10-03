/**
 * Symbol Input Component with Dropdown Support
 * Provides both manual entry and MT5 symbol fetching functionality
 */

class SymbolInput {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            placeholder: 'Enter symbol (e.g., EURUSD)',
            showDropdown: true,
            allowManualEntry: true,
            onSymbolSelect: null,
            onSymbolChange: null,
            ...options
        };
        
        this.symbols = [];
        this.filteredSymbols = [];
        this.selectedIndex = -1;
        this.isDropdownOpen = false;
        
        this.init();
    }
    
    init() {
        this.createElements();
        this.attachEventListeners();
        this.loadSymbols();
    }
    
    createElements() {
        this.container.innerHTML = `
            <div class="symbol-input-wrapper">
                <input type="text" 
                       class="symbol-input" 
                       placeholder="${this.options.placeholder}"
                       autocomplete="off">
                <button class="symbol-dropdown-btn" type="button" title="Browse symbols">
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <path d="M6 8L2 4h8z" fill="currentColor"/>
                    </svg>
                </button>
                <div class="symbol-dropdown" style="display: none;">
                    <div class="symbol-search">
                        <input type="text" placeholder="Search symbols..." class="symbol-search-input">
                    </div>
                    <div class="symbol-list"></div>
                    <div class="symbol-loading" style="display: none;">Loading symbols...</div>
                </div>
            </div>
        `;
        
        this.input = this.container.querySelector('.symbol-input');
        this.dropdownBtn = this.container.querySelector('.symbol-dropdown-btn');
        this.dropdown = this.container.querySelector('.symbol-dropdown');
        this.searchInput = this.container.querySelector('.symbol-search-input');
        this.symbolList = this.container.querySelector('.symbol-list');
        this.loadingDiv = this.container.querySelector('.symbol-loading');
    }
    
    attachEventListeners() {
        // Main input events
        this.input.addEventListener('input', (e) => {
            const value = e.target.value;
            this.filterSymbols(value);
            this.showDropdown();
            
            if (this.options.onSymbolChange) {
                this.options.onSymbolChange(value);
            }
        });
        
        this.input.addEventListener('keydown', (e) => {
            this.handleKeyNavigation(e);
        });
        
        this.input.addEventListener('focus', () => {
            if (this.options.showDropdown) {
                this.showDropdown();
            }
        });
        
        // Dropdown button
        this.dropdownBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleDropdown();
        });
        
        // Search input
        this.searchInput.addEventListener('input', (e) => {
            this.filterSymbols(e.target.value);
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.hideDropdown();
            }
        });
    }
    
    async loadSymbols() {
        if (!window.mt5API) {
            console.warn('MT5 API not available');
            return;
        }
        
        try {
            this.showLoading(true);
            const result = await window.mt5API.getSymbols();
            
            if (result.success) {
                this.symbols = result.data;
                this.filteredSymbols = [...this.symbols];
                this.renderSymbolList();
            } else {
                console.error('Failed to load symbols:', result.error);
            }
        } catch (error) {
            console.error('Error loading symbols:', error);
        } finally {
            this.showLoading(false);
        }
    }
    
    filterSymbols(query) {
        if (!query) {
            this.filteredSymbols = [...this.symbols];
        } else {
            const queryLower = query.toLowerCase();
            this.filteredSymbols = this.symbols.filter(symbol => 
                symbol.name.toLowerCase().includes(queryLower) ||
                symbol.description.toLowerCase().includes(queryLower)
            );
        }
        
        this.selectedIndex = -1;
        this.renderSymbolList();
    }
    
    renderSymbolList() {
        if (this.filteredSymbols.length === 0) {
            this.symbolList.innerHTML = '<div class="symbol-item no-results">No symbols found</div>';
            return;
        }
        
        const maxItems = 10;
        const itemsToShow = this.filteredSymbols.slice(0, maxItems);
        
        this.symbolList.innerHTML = itemsToShow.map((symbol, index) => `
            <div class="symbol-item ${index === this.selectedIndex ? 'selected' : ''}" 
                 data-symbol="${symbol.name}" 
                 data-index="${index}">
                <div class="symbol-name">${symbol.name}</div>
                <div class="symbol-desc">${symbol.description}</div>
                <div class="symbol-details">
                    ${symbol.currency_base}/${symbol.currency_profit} • ${symbol.digits} digits
                </div>
            </div>
        `).join('');
        
        // Add click handlers to symbol items
        this.symbolList.querySelectorAll('.symbol-item[data-symbol]').forEach(item => {
            item.addEventListener('click', () => {
                this.selectSymbol(item.dataset.symbol);
            });
        });
    }
    
    handleKeyNavigation(e) {
        if (!this.isDropdownOpen) return;
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredSymbols.length - 1);
                this.updateSelection();
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                this.updateSelection();
                break;
                
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0 && this.filteredSymbols[this.selectedIndex]) {
                    this.selectSymbol(this.filteredSymbols[this.selectedIndex].name);
                }
                break;
                
            case 'Escape':
                this.hideDropdown();
                break;
        }
    }
    
    updateSelection() {
        this.symbolList.querySelectorAll('.symbol-item').forEach((item, index) => {
            item.classList.toggle('selected', index === this.selectedIndex);
        });
        
        // Scroll selected item into view
        const selectedItem = this.symbolList.querySelector('.symbol-item.selected');
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest' });
        }
    }
    
    selectSymbol(symbolName) {
        this.input.value = symbolName;
        this.hideDropdown();
        
        if (this.options.onSymbolSelect) {
            const symbolData = this.symbols.find(s => s.name === symbolName);
            this.options.onSymbolSelect(symbolName, symbolData);
        }
        
        if (this.options.onSymbolChange) {
            this.options.onSymbolChange(symbolName);
        }
    }
    
    showDropdown() {
        if (!this.options.showDropdown) return;
        
        this.isDropdownOpen = true;
        this.dropdown.style.display = 'block';
        this.renderSymbolList();
    }
    
    hideDropdown() {
        this.isDropdownOpen = false;
        this.dropdown.style.display = 'none';
        this.selectedIndex = -1;
    }
    
    toggleDropdown() {
        if (this.isDropdownOpen) {
            this.hideDropdown();
        } else {
            this.showDropdown();
        }
    }
    
    showLoading(show) {
        this.loadingDiv.style.display = show ? 'block' : 'none';
        if (show) {
            this.symbolList.innerHTML = '';
        }
    }
    
    // Public methods
    getValue() {
        return this.input.value;
    }
    
    setValue(value) {
        this.input.value = value;
        if (this.options.onSymbolChange) {
            this.options.onSymbolChange(value);
        }
    }
    
    clear() {
        this.input.value = '';
        this.hideDropdown();
    }
    
    focus() {
        this.input.focus();
    }
    
    disable() {
        this.input.disabled = true;
        this.dropdownBtn.disabled = true;
    }
    
    enable() {
        this.input.disabled = false;
        this.dropdownBtn.disabled = false;
    }
}

// Make it globally available
window.SymbolInput = SymbolInput;