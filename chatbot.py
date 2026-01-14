"""
Python UI Chatbot using OpenRouter LLM
"""
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import threading
import requests
import json
import os

class ChatbotApp:
    def __init__(self, root):
        self.root = root
        self.root.title("OpenRouter Chatbot")
        self.root.geometry("700x600")
        
        self.api_key = os.getenv("OPENROUTER_API_KEY", "")
        self.model = "openai/gpt-3.5-turbo"
        self.conversation_history = []
        
        self.setup_ui()
        
    def setup_ui(self):
        # Settings frame
        settings_frame = ttk.LabelFrame(self.root, text="Settings", padding=10)
        settings_frame.pack(fill="x", padx=10, pady=5)
        
        ttk.Label(settings_frame, text="API Key:").grid(row=0, column=0, sticky="w")
        self.api_key_entry = ttk.Entry(settings_frame, width=50, show="*")
        self.api_key_entry.insert(0, self.api_key)
        self.api_key_entry.grid(row=0, column=1, padx=5)
        
        ttk.Label(settings_frame, text="Model:").grid(row=1, column=0, sticky="w", pady=5)
        self.model_combo = ttk.Combobox(settings_frame, width=47, values=[
            "openai/gpt-3.5-turbo",
            "openai/gpt-4",
            "anthropic/claude-3-haiku",
            "anthropic/claude-3-sonnet",
            "google/gemini-pro",
            "meta-llama/llama-3-70b-instruct"
        ])
        self.model_combo.set(self.model)
        self.model_combo.grid(row=1, column=1, padx=5)

        # Chat display
        chat_frame = ttk.LabelFrame(self.root, text="Chat", padding=10)
        chat_frame.pack(fill="both", expand=True, padx=10, pady=5)
        
        self.chat_display = scrolledtext.ScrolledText(chat_frame, wrap=tk.WORD, state="disabled")
        self.chat_display.pack(fill="both", expand=True)
        
        # Configure tags for styling
        self.chat_display.tag_configure("user", foreground="#0066cc", font=("Arial", 10, "bold"))
        self.chat_display.tag_configure("assistant", foreground="#006600", font=("Arial", 10))
        self.chat_display.tag_configure("error", foreground="#cc0000", font=("Arial", 10, "italic"))
        
        # Input frame
        input_frame = ttk.Frame(self.root, padding=10)
        input_frame.pack(fill="x", padx=10, pady=5)
        
        self.message_entry = ttk.Entry(input_frame)
        self.message_entry.pack(side="left", fill="x", expand=True, padx=(0, 10))
        self.message_entry.bind("<Return>", lambda e: self.send_message())
        
        self.send_btn = ttk.Button(input_frame, text="Send", command=self.send_message)
        self.send_btn.pack(side="left")
        
        self.clear_btn = ttk.Button(input_frame, text="Clear", command=self.clear_chat)
        self.clear_btn.pack(side="left", padx=5)
        
    def append_message(self, role, content, tag):
        self.chat_display.config(state="normal")
        prefix = "You: " if role == "user" else "Assistant: "
        self.chat_display.insert(tk.END, f"{prefix}{content}\n\n", tag)
        self.chat_display.config(state="disabled")
        self.chat_display.see(tk.END)

    def send_message(self):
        message = self.message_entry.get().strip()
        if not message:
            return
            
        api_key = self.api_key_entry.get().strip()
        if not api_key:
            messagebox.showerror("Error", "Please enter your OpenRouter API key")
            return
            
        self.message_entry.delete(0, tk.END)
        self.append_message("user", message, "user")
        self.conversation_history.append({"role": "user", "content": message})
        
        self.send_btn.config(state="disabled")
        threading.Thread(target=self.call_api, args=(api_key, message), daemon=True).start()
        
    def call_api(self, api_key, message):
        try:
            model = self.model_combo.get()
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost",
                },
                json={
                    "model": model,
                    "messages": self.conversation_history
                },
                timeout=60
            )
            
            if response.status_code == 200:
                data = response.json()
                assistant_message = data["choices"][0]["message"]["content"]
                self.conversation_history.append({"role": "assistant", "content": assistant_message})
                self.root.after(0, lambda: self.append_message("assistant", assistant_message, "assistant"))
            else:
                error_msg = f"API Error: {response.status_code} - {response.text}"
                self.root.after(0, lambda: self.append_message("error", error_msg, "error"))
                
        except Exception as e:
            self.root.after(0, lambda: self.append_message("error", f"Error: {str(e)}", "error"))
        finally:
            self.root.after(0, lambda: self.send_btn.config(state="normal"))
            
    def clear_chat(self):
        self.chat_display.config(state="normal")
        self.chat_display.delete(1.0, tk.END)
        self.chat_display.config(state="disabled")
        self.conversation_history = []

if __name__ == "__main__":
    root = tk.Tk()
    app = ChatbotApp(root)
    root.mainloop()
