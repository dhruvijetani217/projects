import torch
from model import MiniGPT

checkpoint = torch.load("mini_coder.pth")

vocab_size = checkpoint["vocab_size"]
stoi = checkpoint["stoi"]
itos = checkpoint["itos"]

model = MiniGPT(vocab_size)
model.load_state_dict(checkpoint["model_state"])
model.eval()

print("MiniGPT Ready 🚀")
print("Type 'exit' to stop")

def generate(prompt, max_new_tokens=100, temperature=0.8):
    input_ids = [stoi[c] for c in prompt if c in stoi]

    input_tensor = torch.tensor([input_ids])

    for _ in range(max_new_tokens):

        with torch.no_grad():
            logits = model(input_tensor)

        next_token_logits = logits[0, -1]

        probs = torch.softmax(next_token_logits / temperature, dim=-1)
        next_token = torch.multinomial(probs, 1).item()

        input_ids.append(next_token)
        input_tensor = torch.tensor([input_ids])

    return "".join([itos[i] for i in input_ids])

while True:
    user_input = input("\nYou: ")

    if user_input.lower() == "exit":
        break

    output = generate(user_input, max_new_tokens=150)
    print("Model:", output)