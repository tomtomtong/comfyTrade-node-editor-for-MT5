class TutorialManager {
  constructor() {
    this.steps = [];
    this.currentStepIndex = 0;
    this.isActive = false;
    this.overlay = null;
    this.tooltip = null;
    this.resizeHandler = this.handleResize.bind(this);
    this.originalPosition = null; // Store original position of highlighted element
  }

  init() {
    this.createOverlay();
    this.createTooltip();
    
    // Define steps
    this.steps = [
      {
        element: null, // Center screen
        title: "Welcome to MT5 Strategy Builder",
        description: "This tool allows you to create automated trading strategies using a visual node editor. Let's take a quick tour!"
      },
      {
        element: "#connectBtn",
        title: "Connect to MetaTrader 5",
        description: "First, click here to establish a connection with your MetaTrader 5 terminal. Make sure MT5 is running."
      },
      {
        element: ".left-sidebar",
        title: "Node Library",
        description: "Drag and drop nodes from here onto the canvas. You have Triggers, Data, Logic, and Trading nodes."
      },
      {
        element: "#nodeCanvas",
        title: "Strategy Canvas",
        description: "This is your workspace. Connect nodes together to build your strategy logic. Right-click to pan, scroll to zoom."
      },
      {
        element: ".right-sidebar",
        title: "Properties & Info",
        description: "Select a node to edit its properties here. You can also see your account info and positions."
      },
      {
        element: "#runStrategyBtn",
        title: "Run Strategy",
        description: "Once your strategy is ready, click here to start executing it."
      },
      {
        element: "#settingsBtn",
        title: "Settings",
        description: "Configure API keys, notifications, and overtrade protection here. You can also restart this tutorial from the Help button."
      }
    ];

    // Check if first run
    const tutorialCompleted = localStorage.getItem('tutorialCompleted');
    if (!tutorialCompleted) {
      // Delay slightly to ensure UI is ready
      setTimeout(() => {
        this.start();
      }, 1000);
    }

    window.addEventListener('resize', this.resizeHandler);
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'tutorial-overlay';
    this.overlay.style.display = 'none';
    document.body.appendChild(this.overlay);
  }

  createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tutorial-tooltip';
    this.tooltip.style.display = 'none';
    this.tooltip.innerHTML = `
      <button class="tutorial-close" onclick="tutorialManager.end()">×</button>
      <h3 id="tutorialTitle">Title</h3>
      <p id="tutorialDesc">Description</p>
      <div class="tutorial-controls">
        <span id="tutorialStepCount" class="tutorial-steps-indicator">1/5</span>
        <div class="tutorial-buttons">
          <button id="tutorialSkipBtn" class="tutorial-btn tutorial-btn-skip">Skip</button>
          <button id="tutorialPrevBtn" class="tutorial-btn tutorial-btn-secondary">Back</button>
          <button id="tutorialNextBtn" class="tutorial-btn tutorial-btn-primary">Next</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.tooltip);

    document.getElementById('tutorialSkipBtn').addEventListener('click', () => this.end());
    document.getElementById('tutorialPrevBtn').addEventListener('click', () => this.prevStep());
    document.getElementById('tutorialNextBtn').addEventListener('click', () => this.nextStep());
  }

  start() {
    this.isActive = true;
    this.currentStepIndex = 0;
    this.overlay.style.display = 'block';
    this.tooltip.style.display = 'block';
    this.showStep(0);
  }

  end() {
    this.isActive = false;
    this.overlay.style.display = 'none';
    this.tooltip.style.display = 'none';
    this.removeHighlight();
    localStorage.setItem('tutorialCompleted', 'true');
  }

  showStep(index) {
    if (index < 0 || index >= this.steps.length) return;
    
    const step = this.steps[index];
    this.currentStepIndex = index;

    // Update Content
    document.getElementById('tutorialTitle').innerText = step.title;
    document.getElementById('tutorialDesc').innerText = step.description;
    document.getElementById('tutorialStepCount').innerText = `${index + 1}/${this.steps.length}`;
    
    // Button states
    document.getElementById('tutorialPrevBtn').disabled = index === 0;
    document.getElementById('tutorialNextBtn').innerText = index === this.steps.length - 1 ? 'Finish' : 'Next';

    // Highlight Element
    this.removeHighlight();
    
    let targetRect;

    if (step.element) {
      const target = document.querySelector(step.element);
      if (target) {
        // Handle Position for z-index
        const computedStyle = window.getComputedStyle(target);
        if (computedStyle.position === 'static') {
          // We need to force relative for z-index to work
          // But we should clean up after
          // Using a class is safer, but the class handles z-index. 
          // The class doesn't force position: relative unless we put it in CSS. 
          // I added position: relative to .tutorial-highlight in CSS.
        }
        
        target.classList.add('tutorial-highlight');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetRect = target.getBoundingClientRect();
        
        // Disable overlay dimming (element box-shadow provides it)
        this.overlay.classList.remove('dimmed');
      } else {
        // Fallback if element not found
        this.overlay.classList.add('dimmed');
      }
    } else {
      // No element (Welcome step) -> Dim overlay
      this.overlay.classList.add('dimmed');
    }

    this.positionTooltip(targetRect);
  }

  positionTooltip(targetRect) {
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const margin = 15;
    
    // Screen dimensions
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const tipW = tooltipRect.width;
    const tipH = tooltipRect.height;

    if (!targetRect) {
      // Center screen if no target
      this.tooltip.style.top = `${(screenH - tipH) / 2}px`;
      this.tooltip.style.left = `${(screenW - tipW) / 2}px`;
      return;
    }

    // Try to position to the right, then left, then bottom, then top
    // Prioritize Bottom for top-bar items, Right for sidebar items
    
    let preferredPos = 'bottom';
    
    // Heuristic based on screen position
    if (targetRect.top < 100) preferredPos = 'bottom'; // Top toolbar items -> show bottom
    else if (targetRect.left < 300) preferredPos = 'right'; // Left sidebar -> show right
    else if (targetRect.right > screenW - 350) preferredPos = 'left'; // Right sidebar -> show left
    else preferredPos = 'bottom'; // Default

    // Calculate positions
    const posOptions = {
      bottom: {
        top: targetRect.bottom + margin,
        left: targetRect.left + (targetRect.width / 2) - (tipW / 2)
      },
      top: {
        top: targetRect.top - tipH - margin,
        left: targetRect.left + (targetRect.width / 2) - (tipW / 2)
      },
      right: {
        top: targetRect.top + (targetRect.height / 2) - (tipH / 2),
        left: targetRect.right + margin
      },
      left: {
        top: targetRect.top + (targetRect.height / 2) - (tipH / 2),
        left: targetRect.left - tipW - margin
      }
    };

    // Apply preferred
    let chosen = posOptions[preferredPos];

    // --- BOUNDARY CHECKS ---

    // 1. Vertical Overflow Check
    if (chosen.top < margin) {
        // Too high? Flip to bottom
        chosen = posOptions.bottom;
    } else if (chosen.top + tipH > screenH - margin) {
        // Too low? Flip to top
        chosen = posOptions.top;
    }

    // 2. Horizontal Overflow Check
    if (chosen.left < margin) {
        // Too far left? Flip to right
        chosen = posOptions.right;
    } else if (chosen.left + tipW > screenW - margin) {
        // Too far right? Flip to left
        chosen = posOptions.left;
    }

    // 3. Hard Clamping (Final Safety Net)
    // Ensure it never goes off screen even after flips
    if (chosen.left < margin) chosen.left = margin;
    if (chosen.left + tipW > screenW - margin) chosen.left = screenW - tipW - margin;
    if (chosen.top < margin) chosen.top = margin;
    if (chosen.top + tipH > screenH - margin) chosen.top = screenH - tipH - margin;

    this.tooltip.style.top = `${chosen.top}px`;
    this.tooltip.style.left = `${chosen.left}px`;
  }

  removeHighlight() {
    const highlighted = document.querySelectorAll('.tutorial-highlight');
    highlighted.forEach(el => el.classList.remove('tutorial-highlight'));
  }

  nextStep() {
    if (this.currentStepIndex < this.steps.length - 1) {
      this.showStep(this.currentStepIndex + 1);
    } else {
      this.end();
    }
  }

  prevStep() {
    if (this.currentStepIndex > 0) {
      this.showStep(this.currentStepIndex - 1);
    }
  }

  handleResize() {
    if (this.isActive) {
      // Debounce?
      this.showStep(this.currentStepIndex);
    }
  }
}

const tutorialManager = new TutorialManager();
document.addEventListener('DOMContentLoaded', () => {
  tutorialManager.init();
});

// Expose for manual triggering
window.startTutorial = () => tutorialManager.start();
