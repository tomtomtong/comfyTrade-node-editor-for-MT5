"""
Fetch All Symbols from MetaTrader 5
------------------------------------
Standalone utility to retrieve all available trading symbols from MT5.
Outputs JSON by default or CSV format.

Usage examples:
  - python fetch_symbols.py
  - python fetch_symbols.py --format csv --output symbols.csv
  - python fetch_symbols.py --group "Forex*" --visible-only
  - python fetch_symbols.py --search EUR --json
  - python fetch_symbols.py --login 123456 --password pass --server broker
"""

import argparse
import csv
import json
import sys
from typing import Any, Dict, List, Optional

import MetaTrader5 as mt5


def parse_args() -> argparse.Namespace:
	"""Parse command-line arguments."""
	parser = argparse.ArgumentParser(
		description="Fetch all symbols from MT5",
		formatter_class=argparse.RawDescriptionHelpFormatter,
		epilog=__doc__
	)
	
	parser.add_argument(
		"--format", 
		choices=["json", "csv"], 
		default="json",
		help="Output format (default: json)"
	)
	parser.add_argument(
		"--output", 
		type=str, 
		default=None,
		help="Output file path (default: stdout)"
	)
	parser.add_argument(
		"--group", 
		type=str, 
		default="*",
		help="Symbol group filter (e.g., 'Forex*', 'Indices*'). Default: '*' (all symbols)"
	)
	parser.add_argument(
		"--visible-only", 
		action="store_true",
		help="Only include symbols visible in Market Watch"
	)
	parser.add_argument(
		"--search", 
		type=str, 
		default=None,
		help="Search filter: only include symbols matching this string (case-insensitive)"
	)
	parser.add_argument(
		"--login", 
		type=int, 
		help="Account login number (optional)"
	)
	parser.add_argument(
		"--password", 
		type=str, 
		help="Account password (optional)"
	)
	parser.add_argument(
		"--server", 
		type=str, 
		help="Broker server name (optional)"
	)
	parser.add_argument(
		"--pretty", 
		action="store_true",
		help="Pretty print JSON output (with indentation)"
	)
	
	return parser.parse_args()


def ensure_connected(login: Optional[int], password: Optional[str], server: Optional[str]) -> None:
	"""Initialize MT5 and optionally login to an account."""
	if not mt5.initialize():
		raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")
	
	if login and password and server:
		if not mt5.login(login, password, server):
			mt5.shutdown()
			raise RuntimeError(f"MT5 login failed: {mt5.last_error()}")


def fetch_symbols(
	group: str = "*",
	visible_only: bool = False,
	search_filter: Optional[str] = None
) -> List[Dict[str, Any]]:
	"""
	Fetch all symbols from MT5 matching the criteria.
	
	Args:
		group: Symbol group filter (e.g., "Forex*", "Indices*", "*" for all)
		visible_only: Only include symbols visible in Market Watch
		search_filter: Optional string to filter symbols by name or description
	
	Returns:
		List of symbol dictionaries with detailed information
	"""
	symbols = mt5.symbols_get(group=group)
	if symbols is None:
		raise RuntimeError(f"Failed to get symbols: {mt5.last_error()}")
	
	if len(symbols) == 0:
		return []
	
	result = []
	search_lower = search_filter.lower() if search_filter else None
	
	for symbol in symbols:
		# Apply filters
		if visible_only and not symbol.visible:
			continue
		
		if search_lower:
			name_match = search_lower in symbol.name.lower()
			desc_match = hasattr(symbol, 'description') and search_lower in symbol.description.lower()
			if not (name_match or desc_match):
				continue
		
		# Build symbol info dictionary
		symbol_info = {
			"name": symbol.name,
			"description": symbol.description if hasattr(symbol, 'description') else symbol.name,
			"currency_base": symbol.currency_base,
			"currency_profit": symbol.currency_profit,
			"currency_margin": symbol.currency_margin,
			"digits": symbol.digits,
			"point": symbol.point,
			"trade_contract_size": symbol.trade_contract_size,
			"trade_tick_value": symbol.trade_tick_value,
			"trade_tick_size": symbol.trade_tick_size,
			"volume_min": symbol.volume_min,
			"volume_max": symbol.volume_max,
			"volume_step": symbol.volume_step,
			"visible": symbol.visible,
			"select": symbol.select,
			"spread": symbol.spread,
			"spread_float": symbol.spread_float,
			"trade_mode": symbol.trade_mode,
			"trade_stops_level": symbol.trade_stops_level,
			"trade_freeze_level": symbol.trade_freeze_level,
		}
		
		# Add current bid/ask if available
		tick = mt5.symbol_info_tick(symbol.name)
		if tick:
			symbol_info["bid"] = tick.bid
			symbol_info["ask"] = tick.ask
			symbol_info["last"] = tick.last
			symbol_info["volume"] = tick.volume
			symbol_info["time"] = tick.time
		else:
			symbol_info["bid"] = None
			symbol_info["ask"] = None
			symbol_info["last"] = None
			symbol_info["volume"] = None
			symbol_info["time"] = None
		
		result.append(symbol_info)
	
	# Sort by name for consistent output
	result.sort(key=lambda x: x['name'])
	
	return result


def output_json(symbols: List[Dict[str, Any]], output_file: Optional[str], pretty: bool) -> None:
	"""Output symbols in JSON format."""
	output_data = {
		"total": len(symbols),
		"symbols": symbols
	}
	
	json_str = json.dumps(output_data, indent=2 if pretty else None, default=str)
	
	if output_file:
		with open(output_file, 'w', encoding='utf-8') as f:
			f.write(json_str)
		print(f"Saved {len(symbols)} symbols to {output_file}", file=sys.stderr)
	else:
		print(json_str)


def output_csv(symbols: List[Dict[str, Any]], output_file: Optional[str]) -> None:
	"""Output symbols in CSV format."""
	if not symbols:
		print("No symbols to output", file=sys.stderr)
		return
	
	# Get all unique keys from all symbols
	fieldnames = set()
	for symbol in symbols:
		fieldnames.update(symbol.keys())
	fieldnames = sorted(fieldnames)
	
	file_handle = open(output_file, 'w', newline='', encoding='utf-8') if output_file else sys.stdout
	writer = csv.DictWriter(file_handle, fieldnames=fieldnames, extrasaction='ignore')
	
	writer.writeheader()
	for symbol in symbols:
		# Convert None values to empty strings for CSV
		row = {k: (v if v is not None else '') for k, v in symbol.items()}
		writer.writerow(row)
	
	if output_file:
		file_handle.close()
		print(f"Saved {len(symbols)} symbols to {output_file}", file=sys.stderr)


def main() -> None:
	args = parse_args()
	
	# Connect to MT5
	try:
		ensure_connected(args.login, args.password, args.server)
		print(f"Connected to MT5 successfully", file=sys.stderr)
		
		# Fetch symbols
		print(f"Fetching symbols (group: {args.group})...", file=sys.stderr)
		symbols = fetch_symbols(
			group=args.group,
			visible_only=args.visible_only,
			search_filter=args.search
		)
		
		print(f"Found {len(symbols)} symbols", file=sys.stderr)
		
	finally:
		# Always shutdown MT5 connection
		try:
			mt5.shutdown()
		except Exception:
			pass
	
	# Output results
	if args.format == "json":
		output_json(symbols, args.output, args.pretty)
	elif args.format == "csv":
		output_csv(symbols, args.output)


if __name__ == "__main__":
	try:
		main()
	except KeyboardInterrupt:
		print("\nInterrupted by user", file=sys.stderr)
		sys.exit(1)
	except Exception as e:
		print(f"Error: {e}", file=sys.stderr)
		sys.exit(1)

