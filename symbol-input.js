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
        
        // Performance optimization: pre-built lowercase indexes
        this.symbolIndexes = [];
        
        // Debouncing for search
        this.searchDebounceTimer = null;
        this.debounceDelay = 150; // milliseconds
        
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
        // Main input events with debouncing
        this.input.addEventListener('input', (e) => {
            const value = e.target.value;
            this.debouncedFilter(value);
            this.showDropdown();
            
            // Call onSymbolChange immediately (no debounce) for real-time updates
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
        
        // Search input with debouncing
        this.searchInput.addEventListener('input', (e) => {
            this.debouncedFilter(e.target.value);
        });
        
        // Use event delegation for symbol items (more efficient)
        this.symbolList.addEventListener('click', (e) => {
            const item = e.target.closest('.symbol-item[data-symbol]');
            if (item) {
                this.selectSymbol(item.dataset.symbol);
            }
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
        
        // Clear any pending debounce timers
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
        }
        
        try {
            this.showLoading(true);
            const result = await window.mt5API.getSymbols();
            
            if (result.success) {
                this.symbols = result.data;
                // Pre-build lowercase indexes for faster searching
                this.buildSymbolIndexes();
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
    
    buildSymbolIndexes() {
        // Pre-compute lowercase versions to avoid repeated toLowerCase() calls
        this.symbolIndexes = this.symbols.map(symbol => ({
            nameLower: symbol.name.toLowerCase(),
            descLower: (symbol.description || symbol.name).toLowerCase(),
            symbol: symbol
        }));
    }
    
    debouncedFilter(query) {
        // Clear existing timer
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }
        
        // Set new timer
        this.searchDebounceTimer = setTimeout(() => {
            this.filterSymbols(query);
        }, this.debounceDelay);
    }
    
    filterSymbols(query) {
        if (!query || query.trim() === '') {
            this.filteredSymbols = [...this.symbols];
        } else {
            const queryLower = query.toLowerCase().trim();
            const maxResults = 50; // Limit results early for better performance
            const results = [];
            
            // Use pre-built indexes for faster matching
            for (const index of this.symbolIndexes) {
                if (index.nameLower.includes(queryLower) || index.descLower.includes(queryLower)) {
                    results.push(index.symbol);
                    
                    // Early exit if we have enough results
                    if (results.length >= maxResults) {
                        break;
                    }
                }
            }
            
            // Sort by relevance: exact matches first, then starts-with, then contains
            results.sort((a, b) => {
                const aNameLower = a.name.toLowerCase();
                const bNameLower = b.name.toLowerCase();
                
                // Exact match
                if (aNameLower === queryLower && bNameLower !== queryLower) return -1;
                if (bNameLower === queryLower && aNameLower !== queryLower) return 1;
                
                // Starts with
                const aStarts = aNameLower.startsWith(queryLower);
                const bStarts = bNameLower.startsWith(queryLower);
                if (aStarts && !bStarts) return -1;
                if (bStarts && !aStarts) return 1;
                
                // Alphabetical
                return aNameLower.localeCompare(bNameLower);
            });
            
            this.filteredSymbols = results;
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
        
        // Use DocumentFragment for better performance when building DOM
        const fragment = document.createDocumentFragment();
        
        itemsToShow.forEach((symbol, index) => {
            const item = document.createElement('div');
            item.className = `symbol-item ${index === this.selectedIndex ? 'selected' : ''}`;
            item.setAttribute('data-symbol', symbol.name);
            item.setAttribute('data-index', index);
            
            // Use textContent (automatically escapes HTML, preventing XSS)
            const nameDiv = document.createElement('div');
            nameDiv.className = 'symbol-name';
            nameDiv.textContent = symbol.name;
            
            const descDiv = document.createElement('div');
            descDiv.className = 'symbol-desc';
            descDiv.textContent = symbol.description || symbol.name;
            
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'symbol-details';
            detailsDiv.textContent = `${symbol.currency_base || ''}/${symbol.currency_profit || ''} • ${symbol.digits || 0} digits`;
            
            item.appendChild(nameDiv);
            item.appendChild(descDiv);
            item.appendChild(detailsDiv);
            
            fragment.appendChild(item);
        });
        
        // Single DOM update instead of innerHTML
        this.symbolList.innerHTML = '';
        this.symbolList.appendChild(fragment);
    }
    
    handleKeyNavigation(e) {
        switch (e.key) {
            case 'ArrowDown':
                if (!this.isDropdownOpen) return;
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredSymbols.length - 1);
                this.updateSelection();
                break;
                
            case 'ArrowUp':
                if (!this.isDropdownOpen) return;
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                this.updateSelection();
                break;
                
            case 'Enter':
                e.preventDefault();
                if (this.isDropdownOpen && this.selectedIndex >= 0 && this.filteredSymbols[this.selectedIndex]) {
                    this.selectSymbol(this.filteredSymbols[this.selectedIndex].name);
                } else {
                    // Handle Enter key when dropdown is not open or no selection
                    const currentValue = this.input.value.trim();
                    if (currentValue && this.options.onEnterKey) {
                        this.options.onEnterKey(currentValue);
                    }
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
    
    // Debug method to check if input is functional
    isInputFunctional() {
        return this.input && 
               !this.input.disabled && 
               this.input.parentNode && 
               this.input.offsetParent !== null;
    }
    
    // Method to refresh event listeners if needed
    refreshEventListeners() {
        // This can be called if DOM manipulation affects event listeners
        // Currently not needed as we use proper event delegation
        console.log('SymbolInput event listeners are attached to elements, should be working');
    }
}

// Make it globally available
window.SymbolInput = SymbolInput;

// Global diagnostic function
window.debugSymbolInput = function() {
    if (window.tradeSymbolInput) {
        const input = window.tradeSymbolInput;
        console.log('Symbol Input Debug Info:');
        console.log('- Input element exists:', !!input.input);
        console.log('- Input is functional:', input.isInputFunctional());
        console.log('- Input is disabled:', input.input ? input.input.disabled : 'N/A');
        console.log('- Input has focus:', input.input === document.activeElement);
        console.log('- Current value:', input.getValue());
        console.log('- Container in DOM:', !!input.container.parentNode);
        
        // Test typing
        if (input.input) {
            console.log('Testing input functionality...');
            const testValue = 'TEST' + Math.random().toString(36).substr(2, 3);
            input.setValue(testValue);
            console.log('Set test value:', testValue);
            console.log('Retrieved value:', input.getValue());
            input.clear();
            console.log('Cleared input, current value:', input.getValue());
        }
    } else {
        console.log('No tradeSymbolInput found in window object');
    }
};

// Global fix function for symbol input issues
window.fixSymbolInput = function() {
    console.log('Attempting to fix symbol input...');
    
    if (window.tradeSymbolInput && window.tradeSymbolInput.input) {
        const input = window.tradeSymbolInput.input;
        
        // Re-enable input if disabled
        if (input.disabled) {
            input.disabled = false;
            console.log('Re-enabled input');
        }
        
        // Ensure input is visible and in DOM
        if (input.offsetParent === null) {
            console.log('Input appears to be hidden or removed from DOM');
            // Try to reinitialize if needed
            if (typeof initializeSymbolInput === 'function') {
                console.log('Reinitializing symbol input...');
                initializeSymbolInput();
            }
        }
        
        // Focus the input
        input.focus();
        console.log('Focused input');
        
        // Test functionality
        window.debugSymbolInput();
    } else {
        console.log('Symbol input not found, trying to reinitialize...');
        if (typeof initializeSymbolInput === 'function') {
            initializeSymbolInput();
            console.log('Reinitialized symbol input');
        } else {
            console.log('Cannot reinitialize - initializeSymbolInput function not available');
        }
    }
};