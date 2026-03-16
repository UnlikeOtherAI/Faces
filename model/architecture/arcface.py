"""ArcFace loss — additive angular margin for face recognition.

Paper: ArcFace: Additive Angular Margin Loss for Deep Face Recognition
       Deng et al., CVPR 2019.
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F


class ArcFaceHead(nn.Module):
    """Fully connected classification head with ArcFace margin.

    Used only during training. Not exported to CoreML/TFLite.
    """

    def __init__(self, embedding_dim: int, num_classes: int,
                 margin: float = 0.5, scale: float = 64.0):
        super().__init__()
        self.scale = scale
        self.margin = margin
        self.weight = nn.Parameter(torch.FloatTensor(num_classes, embedding_dim))
        nn.init.xavier_uniform_(self.weight)

        self.cos_m = math.cos(margin)
        self.sin_m = math.sin(margin)
        self.th = math.cos(math.pi - margin)
        self.mm = math.sin(math.pi - margin) * margin

    def forward(self, embeddings: torch.Tensor, labels: torch.Tensor) -> torch.Tensor:
        # Normalise weights and embeddings — dot product = cosine similarity
        cosine = F.linear(embeddings, F.normalize(self.weight))
        sine = torch.sqrt((1.0 - cosine.pow(2)).clamp(0, 1))

        # cos(theta + margin)
        phi = cosine * self.cos_m - sine * self.sin_m
        # For numerical stability: if cos(theta) < threshold, use linear approximation
        phi = torch.where(cosine > self.th, phi, cosine - self.mm)

        one_hot = torch.zeros_like(cosine)
        one_hot.scatter_(1, labels.view(-1, 1).long(), 1)

        logits = (one_hot * phi) + ((1.0 - one_hot) * cosine)
        logits = logits * self.scale

        return F.cross_entropy(logits, labels)
