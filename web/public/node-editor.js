// Node Editor Engine - Web Version
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
    this.hoveredConnection = null;
    this.panOffset = { x: 0, y: 0 };
    this.isPanning = false;
    this.lastPanPos = { x: 0, y: 0 };
    this.spacePressed = false;
    this.undoStack = [];
    this.maxUndoSteps = 20;
    this.copiedNode = null;
    this.autoConnectEnabled = true;

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
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.setupCanvas());
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));
  }

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (e.button === 1 || e.button === 2 || (e.button === 0 && this.spacePressed)) {
      this.isPanning = true;
      this.lastPanPos = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = 'grab';
      return;
    }

    if (e.button !== 0 || this.spacePressed) return;

    const canvasPos = this.screenToCanvas(screenX, screenY);
    const x = canvasPos.x;
    const y = canvasPos.y;

    // Check output sockets
    for (let node of this.nodes) {
      for (let i = 0; i < node.outputs.length; i++) {
        const socket = this.getOutputSocketPos(node, i);
        const dist = Math.hypot(x - socket.x, y - socket.y);
        if (dist < 8 / this.scale) {
          this.connectingFrom = { node, outputIndex: i };
          return;
        }
      }
    }

    // Check connection click
    if (this.hoveredConnection) {
      this.removeConnection(this.hoveredConnection);
      this.hoveredConnection = null;
      return;
    }

    // Check node click
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
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    this.mousePos.x = screenX;
    this.mousePos.y = screenY;

    if (this.isPanning) {
      const dx = e.clientX - this.lastPanPos.x;
      const dy = e.clientY - this.lastPanPos.y;
      this.panOffset.x += dx;
      this.panOffset.y += dy;
      this.lastPanPos = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (this.spacePressed && !this.draggingNode && !this.connectingFrom) {
      this.canvas.style.cursor = 'grab';
    } else if (!this.draggingNode && !this.connectingFrom && !this.isPanning) {
      this.canvas.style.cursor = 'default';
    }

    const canvasPos = this.screenToCanvas(screenX, screenY);

    if (this.draggingNode) {
      this.draggingNode.x = canvasPos.x - this.offset.x;
      this.draggingNode.y = canvasPos.y - this.offset.y;
    } else {
      this.hoveredConnection = this.getConnectionAtPoint(canvasPos.x, canvasPos.y);
    }
  }

  onMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = this.spacePressed ? 'grab' : 'default';
      return;
    }

    if (this.connectingFrom) {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const canvasPos = this.screenToCanvas(screenX, screenY);

      for (let node of this.nodes) {
        if (node === this.connectingFrom.node) continue;
        for (let i = 0; i < node.inputs.length; i++) {
          const socket = this.getInputSocketPos(node, i);
          const dist = Math.hypot(canvasPos.x - socket.x, canvasPos.y - socket.y);
          if (dist < 8 / this.scale) {
            this.addConnection(this.connectingFrom.node, node, i, this.connectingFrom.outputIndex);
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
    const oldScale = this.scale;
    this.scale *= delta;
    this.scale = Math.max(0.1, Math.min(5, this.scale));

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const scaleChange = this.scale / oldScale - 1;
    this.panOffset.x -= mouseX * scaleChange;
    this.panOffset.y -= mouseY * scaleChange;
  }

  onKeyDown(e) {
    const isTextInput = document.activeElement?.tagName === 'INPUT' || 
                        document.activeElement?.tagName === 'TEXTAREA';
    
    if (e.code === 'Space' && !this.spacePressed && !isTextInput) {
      e.preventDefault();
      this.spacePressed = true;
      this.canvas.style.cursor = 'grab';
      return;
    }

    if (e.key === 'Delete' && this.selectedNode && !isTextInput) {
      this.deleteSelectedNode();
    }

    if (e.ctrlKey && e.key === 'z' && !isTextInput) {
      e.preventDefault();
      this.undoLastDeletion();
    }
  }

  onKeyUp(e) {
    if (e.code === 'Space') {
      this.spacePressed = false;
      if (!this.isPanning) this.canvas.style.cursor = 'default';
    }
  }

  screenToCanvas(screenX, screenY) {
    return {
      x: (screenX - this.panOffset.x) / this.scale,
      y: (screenY - this.panOffset.y) / this.scale
    };
  }

  canvasToScreen(canvasX, canvasY) {
    return {
      x: canvasX * this.scale + this.panOffset.x,
      y: canvasY * this.scale + this.panOffset.y
    };
  }

  deleteSelectedNode() {
    if (this.selectedNode) {
      this.removeNodeWithUndo(this.selectedNode);
      this.selectedNode = null;
      if (window.updatePropertiesPanel) window.updatePropertiesPanel(null);
    }
  }

  addNode(type, x, y) {
    const nodeConfig = this.getNodeConfig(type);
    const node = {
      id: Date.now() + Math.random(),
      type,
      x,
      y,
      width: 180,
      height: this.calculateNodeHeight(nodeConfig),
      title: nodeConfig.title,
      inputs: nodeConfig.inputs,
      outputs: nodeConfig.outputs,
      params: { ...nodeConfig.params }
    };
    
    this.nodes.push(node);
    
    // Auto-connect
    if (this.autoConnectEnabled && this.nodes.length > 1) {
      const previousNode = this.nodes[this.nodes.length - 2];
      if (previousNode?.outputs?.length > 0) {
        for (let outputIndex = 0; outputIndex < previousNode.outputs.length; outputIndex++) {
          const outputType = previousNode.outputs[outputIndex];
          if (outputType !== 'trigger') continue;
          
          const outputConnected = this.connections.some(
            conn => conn.from === previousNode && conn.fromOutput === outputIndex
          );
          if (outputConnected) continue;
          
          for (let inputIndex = 0; inputIndex < node.inputs.length; inputIndex++) {
            if (node.inputs[inputIndex] === 'trigger') {
              const inputConnected = this.connections.some(
                conn => conn.to === node && conn.toInput === inputIndex
              );
              if (!inputConnected) {
                this.addConnection(previousNode, node, inputIndex, outputIndex);
                break;
              }
            }
          }
        }
      }
    }
    
    return node;
  }

  calculateNodeHeight(nodeConfig) {
    const baseHeight = 80;
    const inputHeight = nodeConfig.inputs.length * 25;
    const outputHeight = nodeConfig.outputs.length > 1 ? (nodeConfig.outputs.length - 1) * 25 : 0;
    const paramCount = Object.keys(nodeConfig.params).length;
    const estimatedParamHeight = paramCount > 0 ? Math.max(30, paramCount * 15) : 0;
    return baseHeight + Math.max(inputHeight, outputHeight) + estimatedParamHeight;
  }

  getNodeConfig(type) {
    const configs = {
      'trigger': {
        title: 'Trigger',
        inputs: [],
        outputs: ['trigger'],
        params: { enabled: true }
      },
      'indicator-ma': {
        title: 'Moving Average',
        inputs: ['trigger'],
        outputs: ['trigger'],
        params: { period: 20 }
      },
      'indicator-rsi': {
        title: 'RSI',
        inputs: ['trigger'],
        outputs: ['trigger'],
        params: { period: 14 }
      },
      'conditional-check': {
        title: 'Conditional Check',
        inputs: ['trigger'],
        outputs: ['trigger'],
        params: { symbol: 'EURUSD', operator: '>', price: 1.1000 }
      },
      'logic-and': {
        title: 'AND Gate',
        inputs: ['trigger', 'trigger'],
        outputs: ['trigger'],
        params: {}
      },
      'logic-or': {
        title: 'OR Gate',
        inputs: ['trigger', 'trigger'],
        outputs: ['trigger'],
        params: {}
      },
      'trade-signal': {
        title: 'Open Position',
        inputs: ['trigger'],
        outputs: ['trigger'],
        params: { action: 'BUY', symbol: 'EURUSD', volume: 0.1, stopLoss: 0, takeProfit: 0 }
      },
      'close-position': {
        title: 'Close Position',
        inputs: ['trigger'],
        outputs: ['trigger'],
        params: { ticket: '', closeType: 'all' }
      },
      'modify-position': {
        title: 'Modify Position',
        inputs: ['trigger'],
        outputs: ['trigger'],
        params: { ticket: '', stopLoss: 0, takeProfit: 0 }
      },
      'string-input': {
        title: 'String Input',
        inputs: ['trigger', 'string'],
        outputs: ['string', 'trigger'],
        params: { value: 'Custom text' }
      },
      'string-output': {
        title: 'String Output',
        inputs: ['trigger', 'string'],
        outputs: ['string', 'trigger'],
        params: { displayValue: '', showPopup: true }
      },
      'mt5-data': {
        title: 'MT5 Data',
        inputs: ['trigger', 'string'],
        outputs: ['string', 'trigger'],
        params: { symbol: 'EURUSD', dataType: 'market' }
      },
      'end-strategy': {
        title: 'End Strategy',
        inputs: ['trigger'],
        outputs: [],
        params: { message: 'Strategy completed' }
      }
    };
    return configs[type] || { title: 'Unknown', inputs: [], outputs: [], params: {} };
  }

  addConnection(fromNode, toNode, inputIndex, outputIndex = 0) {
    if (fromNode.outputs.length === 0 || toNode.inputs.length === 0) return;
    if (inputIndex >= toNode.inputs.length || outputIndex >= fromNode.outputs.length) return;
    
    const fromOutputType = fromNode.outputs[outputIndex];
    const toInputType = toNode.inputs[inputIndex];
    if (fromOutputType !== toInputType) return;

    const existingConnection = this.connections.find(
      conn => conn.from === fromNode && conn.to === toNode && 
              conn.toInput === inputIndex && conn.fromOutput === outputIndex
    );
    if (existingConnection) return;

    this.connections = this.connections.filter(
      conn => !(conn.to === toNode && conn.toInput === inputIndex)
    );
    this.connections = this.connections.filter(
      conn => !(conn.from === fromNode && conn.fromOutput === outputIndex)
    );

    this.connections.push({ from: fromNode, to: toNode, toInput: inputIndex, fromOutput: outputIndex });
  }

  removeNode(node) {
    this.nodes = this.nodes.filter(n => n !== node);
    this.connections = this.connections.filter(c => c.from !== node && c.to !== node);
  }

  removeNodeWithUndo(node) {
    const nodeConnections = this.connections.filter(c => c.from === node || c.to === node);
    this.undoStack.push({
      type: 'nodeDelete',
      node: { ...node },
      connections: nodeConnections.map(c => ({ ...c })),
      timestamp: Date.now()
    });
    if (this.undoStack.length > this.maxUndoSteps) this.undoStack.shift();
    this.removeNode(node);
  }

  undoLastDeletion() {
    if (this.undoStack.length === 0) return;
    const undoData = this.undoStack.pop();
    if (undoData.type === 'nodeDelete') {
      const restoredNode = { ...undoData.node };
      this.nodes.push(restoredNode);
      for (let connData of undoData.connections) {
        const fromNode = connData.from.id === restoredNode.id ? restoredNode : this.nodes.find(n => n.id === connData.from.id);
        const toNode = connData.to.id === restoredNode.id ? restoredNode : this.nodes.find(n => n.id === connData.to.id);
        if (fromNode && toNode) {
          this.addConnection(fromNode, toNode, connData.toInput, connData.fromOutput || 0);
        }
      }
      this.selectedNode = restoredNode;
      if (window.updatePropertiesPanel) window.updatePropertiesPanel(restoredNode);
    }
  }

  removeConnection(conn) {
    this.connections = this.connections.filter(c => c !== conn);
  }

  getConnectionAtPoint(x, y) {
    for (let conn of this.connections) {
      const fromSocket = this.getOutputSocketPos(conn.from, conn.fromOutput || 0);
      const toSocket = this.getInputSocketPos(conn.to, conn.toInput);
      const dist = this.pointToLineDistance(x, y, fromSocket.x, fromSocket.y, toSocket.x, toSocket.y);
      if (dist < 5 / this.scale) return conn;
    }
    return null;
  }

  pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    return Math.hypot(px - xx, py - yy);
  }

  isPointInNode(x, y, node) {
    return x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height;
  }

  getInputSocketPos(node, index) {
    return { x: node.x, y: node.y + 40 + index * 25 };
  }

  getOutputSocketPos(node, index) {
    return { x: node.x + node.width, y: node.y + 40 + index * 25 };
  }

  animate() {
    this.draw();
    requestAnimationFrame(() => this.animate());
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.save();
    this.ctx.translate(this.panOffset.x, this.panOffset.y);
    this.ctx.scale(this.scale, this.scale);

    // Draw grid
    this.drawGrid();

    // Draw connections
    for (let conn of this.connections) {
      this.drawConnection(conn, conn === this.hoveredConnection);
    }

    // Draw connecting line
    if (this.connectingFrom) {
      const fromSocket = this.getOutputSocketPos(this.connectingFrom.node, this.connectingFrom.outputIndex);
      const mouseCanvas = this.screenToCanvas(this.mousePos.x, this.mousePos.y);
      this.ctx.beginPath();
      this.ctx.strokeStyle = '#4CAF50';
      this.ctx.lineWidth = 2 / this.scale;
      this.ctx.setLineDash([5 / this.scale, 5 / this.scale]);
      this.ctx.moveTo(fromSocket.x, fromSocket.y);
      this.ctx.lineTo(mouseCanvas.x, mouseCanvas.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // Draw nodes
    for (let node of this.nodes) {
      this.drawNode(node);
    }

    this.ctx.restore();
  }

  drawGrid() {
    const gridSize = 20;
    this.ctx.strokeStyle = '#2a2a2a';
    this.ctx.lineWidth = 0.5 / this.scale;

    const startX = Math.floor(-this.panOffset.x / this.scale / gridSize) * gridSize - gridSize;
    const startY = Math.floor(-this.panOffset.y / this.scale / gridSize) * gridSize - gridSize;
    const endX = startX + this.canvas.width / this.scale + gridSize * 2;
    const endY = startY + this.canvas.height / this.scale + gridSize * 2;

    for (let x = startX; x < endX; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, startY);
      this.ctx.lineTo(x, endY);
      this.ctx.stroke();
    }
    for (let y = startY; y < endY; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(startX, y);
      this.ctx.lineTo(endX, y);
      this.ctx.stroke();
    }
  }

  drawConnection(conn, isHovered) {
    const fromSocket = this.getOutputSocketPos(conn.from, conn.fromOutput || 0);
    const toSocket = this.getInputSocketPos(conn.to, conn.toInput);

    this.ctx.beginPath();
    this.ctx.strokeStyle = isHovered ? '#ff5722' : '#4CAF50';
    this.ctx.lineWidth = (isHovered ? 3 : 2) / this.scale;

    const cp1x = fromSocket.x + 50;
    const cp2x = toSocket.x - 50;
    this.ctx.moveTo(fromSocket.x, fromSocket.y);
    this.ctx.bezierCurveTo(cp1x, fromSocket.y, cp2x, toSocket.y, toSocket.x, toSocket.y);
    this.ctx.stroke();
  }

  drawNode(node) {
    const isSelected = node === this.selectedNode;

    // Node background
    this.ctx.fillStyle = '#1e1e1e';
    this.ctx.strokeStyle = isSelected ? '#4CAF50' : '#333';
    this.ctx.lineWidth = isSelected ? 2 / this.scale : 1 / this.scale;
    this.roundRect(node.x, node.y, node.width, node.height, 8);
    this.ctx.fill();
    this.ctx.stroke();

    // Header
    const headerColor = this.getNodeHeaderColor(node.type);
    this.ctx.fillStyle = headerColor;
    this.ctx.beginPath();
    this.ctx.moveTo(node.x + 8, node.y);
    this.ctx.lineTo(node.x + node.width - 8, node.y);
    this.ctx.quadraticCurveTo(node.x + node.width, node.y, node.x + node.width, node.y + 8);
    this.ctx.lineTo(node.x + node.width, node.y + 30);
    this.ctx.lineTo(node.x, node.y + 30);
    this.ctx.lineTo(node.x, node.y + 8);
    this.ctx.quadraticCurveTo(node.x, node.y, node.x + 8, node.y);
    this.ctx.fill();

    // Title
    this.ctx.fillStyle = '#fff';
    this.ctx.font = `bold ${12 / this.scale}px Arial`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(node.title, node.x + node.width / 2, node.y + 20);

    // Input sockets
    for (let i = 0; i < node.inputs.length; i++) {
      const socket = this.getInputSocketPos(node, i);
      this.ctx.beginPath();
      this.ctx.arc(socket.x, socket.y, 6 / this.scale, 0, Math.PI * 2);
      this.ctx.fillStyle = node.inputs[i] === 'trigger' ? '#ff9800' : '#2196F3';
      this.ctx.fill();
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.stroke();
    }

    // Output sockets
    for (let i = 0; i < node.outputs.length; i++) {
      const socket = this.getOutputSocketPos(node, i);
      this.ctx.beginPath();
      this.ctx.arc(socket.x, socket.y, 6 / this.scale, 0, Math.PI * 2);
      this.ctx.fillStyle = node.outputs[i] === 'trigger' ? '#ff9800' : '#2196F3';
      this.ctx.fill();
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.stroke();
    }

    // Parameters preview
    this.ctx.fillStyle = '#888';
    this.ctx.font = `${10 / this.scale}px Arial`;
    this.ctx.textAlign = 'left';
    let paramY = node.y + 50;
    for (let key in node.params) {
      if (paramY > node.y + node.height - 10) break;
      const value = node.params[key];
      const displayValue = typeof value === 'string' && value.length > 15 
        ? value.substring(0, 15) + '...' 
        : value;
      this.ctx.fillText(`${key}: ${displayValue}`, node.x + 10, paramY);
      paramY += 12;
    }
  }

  getNodeHeaderColor(type) {
    const colors = {
      'trigger': '#ff9800',
      'indicator-ma': '#2196F3',
      'indicator-rsi': '#2196F3',
      'conditional-check': '#9C27B0',
      'logic-and': '#9C27B0',
      'logic-or': '#9C27B0',
      'trade-signal': '#4CAF50',
      'close-position': '#f44336',
      'modify-position': '#FF9800',
      'string-input': '#00BCD4',
      'string-output': '#00BCD4',
      'mt5-data': '#3F51B5',
      'end-strategy': '#607D8B'
    };
    return colors[type] || '#666';
  }

  roundRect(x, y, w, h, r) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  getGraph() {
    return {
      nodes: this.nodes.map(n => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        params: n.params
      })),
      connections: this.connections.map(c => ({
        fromId: c.from.id,
        toId: c.to.id,
        toInput: c.toInput,
        fromOutput: c.fromOutput || 0
      }))
    };
  }

  loadGraph(graph) {
    this.nodes = [];
    this.connections = [];
    
    for (let nodeData of graph.nodes) {
      const nodeConfig = this.getNodeConfig(nodeData.type);
      const node = {
        id: nodeData.id,
        type: nodeData.type,
        x: nodeData.x,
        y: nodeData.y,
        width: 180,
        height: this.calculateNodeHeight(nodeConfig),
        title: nodeConfig.title,
        inputs: nodeConfig.inputs,
        outputs: nodeConfig.outputs,
        params: { ...nodeConfig.params, ...nodeData.params }
      };
      this.nodes.push(node);
    }

    for (let connData of graph.connections) {
      const fromNode = this.nodes.find(n => n.id === connData.fromId);
      const toNode = this.nodes.find(n => n.id === connData.toId);
      if (fromNode && toNode) {
        this.connections.push({
          from: fromNode,
          to: toNode,
          toInput: connData.toInput,
          fromOutput: connData.fromOutput || 0
        });
      }
    }
  }

  clear() {
    this.nodes = [];
    this.connections = [];
    this.selectedNode = null;
  }
}
