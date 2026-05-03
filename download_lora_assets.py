from __future__ import annotations

import argparse
from pathlib import Path

from huggingface_hub import snapshot_download


ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
BASE_DIR = MODELS_DIR / "base-model"
ADAPTER_DIR = MODELS_DIR / "doctor-lora"


def download_repo(repo_id: str, target_dir: Path, token: str | None = None) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {repo_id} -> {target_dir}")
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(target_dir),
        token=token,
    )
    print(f"Finished: {target_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download a real base model and a real LoRA adapter into the project."
    )
    parser.add_argument(
        "--base-repo",
        required=True,
        help="Hugging Face repo id for the base model, for example: Qwen/Qwen2.5-3B-Instruct",
    )
    parser.add_argument(
        "--adapter-repo",
        required=True,
        help="Hugging Face repo id for the LoRA adapter, for example: your-username/medika-doctor-lora",
    )
    parser.add_argument(
        "--token",
        default=None,
        help="Optional Hugging Face token if the repo is gated or private.",
    )
    args = parser.parse_args()

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    download_repo(args.base_repo, BASE_DIR, token=args.token)
    download_repo(args.adapter_repo, ADAPTER_DIR, token=args.token)

    print("\nDone. Your folders are now:")
    print(f"  Base model : {BASE_DIR}")
    print(f"  LoRA adapter: {ADAPTER_DIR}")


if __name__ == "__main__":
    main()
