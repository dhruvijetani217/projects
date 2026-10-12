import torch
import torch.nn.functional as F
from model import MiniGPT

# Load dataset
with open("data.txt", "r", encoding="utf-8") as f:
    text = f.read()

# Build vocabulary
chars = sorted(list(set(text)))
vocab_size = len(chars)

stoi = {ch: i for i, ch in enumerate(chars)}
itos = {i: ch for i, ch in enumerate(chars)}

# Encode data
data = torch.tensor([stoi[c] for c in text], dtype=torch.long)

# Training settings
block_size = 64
batch_size = 16

# Function to get batch
def get_batch():
    ix = torch.randint(len(data) - block_size, (batch_size,))
    x = torch.stack([data[i:i+block_size] for i in ix])
    y = torch.stack([data[i+1:i+block_size+1] for i in ix])
    return x, y

# Model
model = MiniGPT(vocab_size)
optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4)

epochs = 2000

for epoch in range(epochs):

    x, y = get_batch()

    logits = model(x)

    loss = F.cross_entropy(logits.view(-1, vocab_size), y.view(-1))

    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

    if epoch % 100 == 0:
        print(f"Epoch {epoch} Loss: {loss.item()}")

# Save model
torch.save({
    "model_state": model.state_dict(),
    "stoi": stoi,
    "itos": itos,
    "vocab_size": vocab_size
}, "mini_coder.pth")

print("Training complete ✅")