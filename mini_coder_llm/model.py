import torch
import torch.nn as nn
import torch.nn.functional as F

class MiniGPT(nn.Module):
    def __init__(self, vocab_size, embed_size=128, heads=4, layers=2):
        super().__init__()

        self.token_embedding = nn.Embedding(vocab_size, embed_size)
        self.position_embedding = nn.Embedding(512, embed_size)

        decoder_layer = nn.TransformerDecoderLayer(
            d_model=embed_size,
            nhead=heads,
            dim_feedforward=embed_size * 4,
            batch_first=True
        )

        self.transformer = nn.TransformerDecoder(
            decoder_layer,
            num_layers=layers
        )

        self.fc = nn.Linear(embed_size, vocab_size)

    def forward(self, x):
        B, T = x.shape
        positions = torch.arange(T, device=x.device).unsqueeze(0)

        x = self.token_embedding(x) + self.position_embedding(positions)

        # Causal mask (important!)
        mask = torch.triu(torch.ones(T, T), diagonal=1).bool().to(x.device)

        x = self.transformer(x, x, tgt_mask=mask)

        return self.fc(x)