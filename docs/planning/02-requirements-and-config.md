# Requirements and Configuration

> Python dependencies and BrainConfig defaults.

> Source: [`docs/images/notes`](../images/notes)

## requirements.txt

```
openpyxl>=3.1.2
pandas>=2.0.0
numpy>=1.24.0
xlsxwriter>=3.1.9
python-dateutil>=2.8.2
chardet>=5.1.0
tabulate>=0.9.0
```

## config.py

```python
"""Configuration for the Spreadsheet Brain."""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class BrainConfig:
    """Central configuration."""

    # Limits
    max_rows_preview: int = 20
    max_rows_analysis: int = 100_000
    max_file_size_mb: int = 50

    # Analysis
    outlier_std_threshold: float = 2.5
    trend_min_points: int = 3
    correlation_threshold: float = 0.7

    # Formatting
    currency_symbol: str = "$"
    date_format: str = "%Y-%m-%d"
    decimal_places: int = 2

    # Supported file types
    supported_extensions: list = field(
        default_factory=lambda: [".xlsx", ".xls", ".csv", ".tsv"]
    )


DEFAULT_CONFIG = BrainConfig()
```

