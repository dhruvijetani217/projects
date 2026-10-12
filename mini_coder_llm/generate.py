import torch
from model import MiniGPT

# load same vocab mapping from train.py

# load model
model = MiniGPT(vocab_size)
model.load_state_dict(torch.load("mini_coder.pth"))
model.eval()

def generate(start, length=200):
    input = torch.tensor([[stoi[c] for c in start]])
    result = start

    for _ in range(length):
        output = model(input)
        last = output[0, -1]
        probs = torch.softmax(last, dim=0)
        next_char = torch.multinomial(probs, 1).item()
        result += itos[next_char]
        input = torch.cat([input[:,1:], torch.tensor([[next_char]])], dim=1)

    return result

print(generate("def"))