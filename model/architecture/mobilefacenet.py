"""MobileFaceNet — lightweight face embedding network for mobile inference.

Architecture: depthwise separable convolutions, residual bottlenecks,
global depthwise conv, 128-dim L2-normalised output.

Input:  (N, 3, 112, 112)  RGB normalised to [-1, 1]
Output: (N, 128)          L2-normalised embedding
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class ConvBnPReLU(nn.Module):
    def __init__(self, in_c: int, out_c: int, kernel: int = 3,
                 stride: int = 1, groups: int = 1):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_c, out_c, kernel, stride,
                      padding=kernel // 2, groups=groups, bias=False),
            nn.BatchNorm2d(out_c),
            nn.PReLU(out_c),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class DepthwiseSeparable(nn.Module):
    def __init__(self, in_c: int, out_c: int, stride: int = 1):
        super().__init__()
        self.dw = ConvBnPReLU(in_c, in_c, kernel=3, stride=stride, groups=in_c)
        self.pw = nn.Sequential(
            nn.Conv2d(in_c, out_c, 1, bias=False),
            nn.BatchNorm2d(out_c),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.pw(self.dw(x))


class Bottleneck(nn.Module):
    """Inverted residual block (MobileNetV2-style)."""

    def __init__(self, in_c: int, out_c: int, stride: int = 1, expand: int = 2):
        super().__init__()
        mid_c = in_c * expand
        self.use_residual = stride == 1 and in_c == out_c
        self.block = nn.Sequential(
            # Expand
            nn.Conv2d(in_c, mid_c, 1, bias=False),
            nn.BatchNorm2d(mid_c),
            nn.PReLU(mid_c),
            # Depthwise
            nn.Conv2d(mid_c, mid_c, 3, stride=stride,
                      padding=1, groups=mid_c, bias=False),
            nn.BatchNorm2d(mid_c),
            nn.PReLU(mid_c),
            # Project
            nn.Conv2d(mid_c, out_c, 1, bias=False),
            nn.BatchNorm2d(out_c),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.block(x)
        return out + x if self.use_residual else out


def _make_layer(in_c: int, out_c: int, stride: int, n: int, expand: int) -> nn.Sequential:
    layers = [Bottleneck(in_c, out_c, stride=stride, expand=expand)]
    for _ in range(1, n):
        layers.append(Bottleneck(out_c, out_c, stride=1, expand=expand))
    return nn.Sequential(*layers)


class MobileFaceNet(nn.Module):
    """~1M parameter face embedding network targeting <120ms mobile inference."""

    def __init__(self, embedding_dim: int = 128):
        super().__init__()
        self.stem = ConvBnPReLU(3, 64, kernel=3, stride=2)   # 56x56
        self.dw1  = ConvBnPReLU(64, 64, kernel=3, groups=64) # 56x56 depthwise

        self.layer1 = _make_layer(64,  64,  stride=2, n=5, expand=2)  # 28x28
        self.layer2 = _make_layer(64,  128, stride=2, n=1, expand=4)  # 14x14
        self.layer3 = _make_layer(128, 128, stride=1, n=6, expand=2)  # 14x14
        self.layer4 = _make_layer(128, 128, stride=2, n=1, expand=4)  #  7x7
        self.layer5 = _make_layer(128, 128, stride=1, n=2, expand=2)  #  7x7

        # Global depthwise conv collapses spatial dims
        self.gdc = nn.Sequential(
            nn.Conv2d(128, 128, kernel_size=7, groups=128, bias=False),
            nn.BatchNorm2d(128),
        )

        self.fc = nn.Sequential(
            nn.Flatten(),
            nn.Linear(128, embedding_dim, bias=False),
            nn.BatchNorm1d(embedding_dim),
        )

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.Linear):
                nn.init.xavier_normal_(m.weight)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.stem(x)
        x = self.dw1(x)
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        x = self.layer5(x)
        x = self.gdc(x)
        x = self.fc(x)
        return F.normalize(x, p=2, dim=1)
