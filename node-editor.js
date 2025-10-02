// Node Editor Engine
class NodeEditor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.connections = [];
    this.selectedNode = null;
    this.draggingNode = null;
    this.connectingFrom = null;
    this.offset = { x: 0, y: 0 };
    this.scale = 1;
    this.mousePos = { x: 0, y: 0 };
    
    this.setupCanvas();
    this.setupEventListeners();
    this.animate();
  }

  setupCanvas() {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }

  setupEventListeners() {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this));
    window.addEventListener('resize', () => this.setupCanvas());
  }

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check for output socket click (start connection)
    for (let node of this.nodes) {
      const socket = this.getOutputSocketPos(node);
      const dist = Math.hypot(x - socket.x, y - socket.y);
      if (dist < 8) {
        this.connectingFrom = node;
        return;
      }
    }

    // Check for node click
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      if (this.isPointInNode(x, y, this.nodes[i])) {
        this.draggingNode = this.nodes[i];
        this.selectedNode = this.nodes[i];
        this.offset.x = x - this.nodes[i].x;
        this.offset.y = y - this.nodes[i].y;
        return;
      }
    }

    this.selectedNode = null;
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mousePos.x = e.clientX - rect.left;
    this.mousePos.y = e.clientY - rect.top;

    if (this.draggingNode) {
      this.draggingNode.x = this.mousePos.x - this.offset.x;
      this.draggingNode.y = this.mousePos.y - this.offset.y;
    }
  }

  onMouseUp(e) {
    if (this.connectingFrom) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check if released on an input socket
      for (let node of this.nodes) {
        if (node === this.connectingFrom) continue;
        
        for (let i = 0; i < node.inputs.length; i++) {
          const socket = this.getInputSocketPos(node, i);
          const dist = Math.hypot(x - socket.x, y - socket.y);
          if (dist < 8) {
            this.addConnection(this.connectingFrom, node, i);
            break;
          }
        }
      }
      this.connectingFrom = null;
    }

    this.draggingNode = null;
  }

  onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.scale *= delta;
    this.scale = Math.max(0.5, Math.min(2, this.scale));
  }

  addNode(type, x, y) {
    const nodeConfig = this.getNodeConfig(type);
    const node = {
      id: Date.now() + Math.random(),
      type: type,
      x: x,
      y: y,
      width: 180,
      height: 80 + nodeConfig.inputs.length * 25,
      title: nodeConfig.title,
      inputs: nodeConfig.inputs,
      outputs: nodeConfig.outputs,
      params: { ...nodeConfig.params }
    };
    this.nodes.push(node);
    return node;
  }

  getNodeConfig(type) {
    const configs = {
      'market-data': {
        title: 'Market Data',
        inputs: [],
        outputs: ['price', 'volume'],
        params: { symbol: 'EURUSD' }
      },
      'indicator-ma': {
        title: 'Moving Average',
        inputs: ['price'],
        outputs: ['ma'],
        params: { period: 20 }
      },
      'indicator-rsi': {
        title: 'RSI',
        inputs: ['price'],
        outputs: ['rsi'],
        params: { period: 14 }
      },
      'compare': {
        title: 'Compare',
        inputs: ['value1', 'value2'],
        outputs: ['result'],
        params: { operator: '>' }
      },
      'logic-and': {
        title: 'AND Gate',
        inputs: ['input1', 'input2'],
        outputs: ['output'],
        params: {}
      },
      'logic-or': {
        title: 'OR Gate',
        inputs: ['input1', 'input2'],
        outputs: ['output'],
        params: {}
      },
      'trade-signal': {
        title: 'Trade Signal',
        inputs: ['condition'],
        outputs: [],
        params: { action: 'BUY', volume: 0.1 }
      },
      'stop-loss': {
        title: 'Stop Loss',
        inputs: ['signal'],
        outputs: ['signal'],
        params: { pips: 50 }
      },
      'take-profit': {
        title: 'Take Profit',
        inputs: ['signal'],
        outputs: ['signal'],
        params: { pips: 100 }
      },
      'constant': {
        title: 'Constant',
        inputs: [],
        outputs: ['value'],
        params: { value: 0 }
      }
    };
    return configs[type] || configs['constant'];
  }

  addConnection(fromNode, toNode, inputIndex) {
    // Remove existing connection to this input
    this.connections = this.connections.filter(
      conn => !(conn.to === toNode && conn.toInput === inputIndex)
    );

    this.connections.push({
      from: fromNode,
      to: toNode,
      toInput: inputIndex
    });
  }

  removeNode(node) {
    this.nodes = this.nodes.filter(n => n !== node);
    this.connections = this.connections.filter(
      c => c.from !== node && c.to !== node
    );
  }

  isPointInNode(x, y, node) {
    return x >= node.x && x <= node.x + node.width &&
           y >= node.y && y <= node.y + node.height;
  }

  getInputSocketPos(node, index) {
    return {
      x: node.x,
      y: node.y + 40 + index * 25
    };
  }

  getOutputSocketPos(node) {
    return {
      x: node.x + node.width,
      y: node.y + 40
    };
  }

  animate() {
    this.draw();
    requestAnimationFrame(() => this.animate());
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid
    this.drawGrid();

    // Draw connections
    ctx.strokeStyle = '#64B5F6';
    ctx.lineWidth = 2;
    for (let conn of this.connections) {
      const from = this.getOutputSocketPos(conn.from);
      const to = this.getInputSocketPos(conn.to, conn.toInput);
      
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      
      const midX = (from.x + to.x) / 2;
      ctx.bezierCurveTo(midX, from.y, midX, to.y, to.x, to.y);
      ctx.stroke();
    }

    // Draw connecting line
    if (this.connectingFrom) {
      const from = this.getOutputSocketPos(this.connectingFrom);
      ctx.strokeStyle = '#FFA726';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(this.mousePos.x, this.mousePos.y);
      ctx.stroke();
    }

    // Draw nodes
    for (let node of this.nodes) {
      this.drawNode(node);
    }
  }

  drawGrid() {
    const ctx = this.ctx;
    const gridSize = 20;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    for (let x = 0; x < this.canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y < this.canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }
  }

  drawNode(node) {
    const ctx = this.ctx;
    const isSelected = node === this.selectedNode;

    // Node body
    ctx.fillStyle = '#2d2d2d';
    ctx.strokeStyle = isSelected ? '#4CAF50' : '#444';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.beginPath();
    ctx.roundRect(node.x, node.y, node.width, node.height, 8);
    ctx.fill();
    ctx.stroke();

    // Title bar
    ctx.fillStyle = '#1e1e1e';
    ctx.beginPath();
    ctx.roundRect(node.x, node.y, node.width, 30, [8, 8, 0, 0]);
    ctx.fill();

    // Title text
    ctx.fillStyle = '#e0e0e0';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(node.title, node.x + node.width / 2, node.y + 20);

    // Input sockets
    ctx.fillStyle = '#64B5F6';
    for (let i = 0; i < node.inputs.length; i++) {
      const pos = this.getInputSocketPos(node, i);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Input label
      ctx.fillStyle = '#b0b0b0';
      ctx.font = '11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(node.inputs[i], pos.x + 10, pos.y + 4);
    }

    // Output socket
    if (node.outputs.length > 0) {
      const pos = this.getOutputSocketPos(node);
      ctx.fillStyle = '#4CAF50';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Output label
      ctx.fillStyle = '#b0b0b0';
      ctx.font = '11px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(node.outputs[0], pos.x - 10, pos.y + 4);
    }

    // Parameters
    ctx.fillStyle = '#888';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    let paramY = node.y + node.height - 15;
    const paramText = Object.entries(node.params)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    ctx.fillText(paramText, node.x + node.width / 2, paramY);
  }

  exportGraph() {
    return {
      nodes: this.nodes.map(n => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        params: n.params
      })),
      connections: this.connections.map(c => ({
        from: c.from.id,
        to: c.to.id,
        toInput: c.toInput
      }))
    };
  }

  importGraph(data) {
    this.nodes = [];
    this.connections = [];

    // Recreate nodes
    const nodeMap = new Map();
    for (let nodeData of data.nodes) {
      const node = this.addNode(nodeData.type, nodeData.x, nodeData.y);
      node.id = nodeData.id;
      node.params = nodeData.params;
      nodeMap.set(nodeData.id, node);
    }

    // Recreate connections
    for (let connData of data.connections) {
      const fromNode = nodeMap.get(connData.from);
      const toNode = nodeMap.get(connData.to);
      if (fromNode && toNode) {
        this.addConnection(fromNode, toNode, connData.toInput);
      }
    }
  }

  clear() {
    this.nodes = [];
    this.connections = [];
    this.selectedNode = null;
  }
}

// Make it available globally
window.NodeEditor = NodeEditor;
