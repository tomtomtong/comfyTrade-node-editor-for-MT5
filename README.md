# MT5 Trading Strategy Executor

An Electron desktop application for executing trading strategies on MetaTrader 5.

## Features

- Connect to MetaTrader 5 terminal
- View real-time account information
- Execute trading strategies with customizable parameters
- Monitor open positions
- Close positions directly from the app
- Auto-refresh account and position data

## Installation

1. Install dependencies:
```
npm install
```

2. Start the application:
```
npm start
```

## MT5 Integration Setup

This application communicates with MT5 using ZeroMQ. You need to:

1. Install ZeroMQ library for MT5
2. Create an Expert Advisor (EA) in MT5 that acts as a ZeroMQ server
3. The EA should handle these commands:
   - GET_ACCOUNT_INFO
   - EXECUTE_ORDER
   - GET_POSITIONS
   - CLOSE_POSITION

### Example MT5 EA Structure (MQL5)

```mql5
#include <Zmq/Zmq.mqh>

Context context;
Socket socket(context, ZMQ_REP);

int OnInit() {
   socket.bind("tcp://*:5555");
   return(INIT_SUCCEEDED);
}

void OnTick() {
   ZmqMsg request;
   if(socket.recv(request, true)) {
      string command = request.getData();
      string response = ProcessCommand(command);
      socket.send(response);
   }
}
```

## Usage

1. Launch the application
2. Enter your MT5 server details (default: localhost:5555)
3. Click "Connect"
4. Configure your trading strategy parameters
5. Click "Execute Trade" to place orders
6. Monitor positions in the positions table

## Configuration

Edit the connection settings in the UI:
- Server: MT5 terminal address (default: localhost)
- Port: ZeroMQ port (default: 5555)

## Development

Run in development mode with DevTools:
```
npm run dev
```

## Notes

- This is a template application with mock data
- Replace the MT5Bridge implementation with actual ZeroMQ communication
- Always test on a demo account first
- Implement proper error handling and risk management
- Consider adding authentication and encryption for production use

## Disclaimer

Trading involves risk. This software is provided as-is without any guarantees. Always test thoroughly on demo accounts before using with real money.
