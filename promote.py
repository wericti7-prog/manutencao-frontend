#!/usr/bin/env python3
"""
promote.py — Promoção de Staging → Produção
════════════════════════════════════════════
Copia os arquivos do ambiente de staging para produção,
fazendo backup automático antes de qualquer alteração.

Uso:
    python promote.py              → modo interativo (recomendado)
    python promote.py --force      → promove sem pedir confirmação
    python promote.py --dry-run    → simula sem alterar nada
    python promote.py --rollback   → restaura o último backup
"""

import os, sys, shutil, hashlib, datetime, argparse
from pathlib import Path

# ── Configuração de caminhos ────────────────────────────────────────────────
ROOT       = Path(__file__).parent          # pasta raiz do projeto
STAGING    = ROOT / "staging"               # pasta de homologação
PROD_FILES = ["index.html", "script.js", "styles.css"]  # arquivos a promover
BACKUP_DIR = ROOT / "_backups"              # onde ficam os backups

# api.js NUNCA é promovido automaticamente — cada ambiente tem o seu
NEVER_PROMOTE = {"api.js"}

# ── Helpers ─────────────────────────────────────────────────────────────────
RED   = "\033[91m"
GREEN = "\033[92m"
YEL   = "\033[93m"
BLUE  = "\033[94m"
BOLD  = "\033[1m"
RST   = "\033[0m"

def header(msg):  print(f"\n{BOLD}{BLUE}{'═'*55}{RST}\n{BOLD}  {msg}{RST}\n{BLUE}{'═'*55}{RST}")
def ok(msg):      print(f"  {GREEN}✔{RST}  {msg}")
def warn(msg):    print(f"  {YEL}⚠{RST}  {msg}")
def err(msg):     print(f"  {RED}✘{RST}  {msg}")
def info(msg):    print(f"  {BLUE}ℹ{RST}  {msg}")
def hr():         print(f"  {'─'*50}")

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()[:12]

def file_size(path: Path) -> str:
    b = path.stat().st_size
    if b < 1024:       return f"{b} B"
    if b < 1024**2:    return f"{b/1024:.1f} KB"
    return f"{b/1024**2:.1f} MB"

def timestamp() -> str:
    return datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

# ── Backup ───────────────────────────────────────────────────────────────────
def fazer_backup(files: list[Path]) -> Path:
    ts       = timestamp()
    dest     = BACKUP_DIR / ts
    dest.mkdir(parents=True, exist_ok=True)
    meta     = dest / "BACKUP_INFO.txt"
    linhas   = [f"Backup criado em: {datetime.datetime.now().isoformat()}\n\n"]

    for f in files:
        if f.exists():
            dst = dest / f.name
            shutil.copy2(f, dst)
            linhas.append(f"{f.name}  sha256:{sha256(f)}  {file_size(f)}\n")
            ok(f"Backup: {f.name} → _backups/{ts}/")

    meta.write_text("".join(linhas))
    return dest

def listar_backups() -> list[Path]:
    if not BACKUP_DIR.exists():
        return []
    return sorted(BACKUP_DIR.iterdir(), reverse=True)

# ── Diff simples ─────────────────────────────────────────────────────────────
def mostrar_diff(staging_f: Path, prod_f: Path):
    if not prod_f.exists():
        warn(f"{prod_f.name}: arquivo novo (não existia em produção)")
        return
    h_stg  = sha256(staging_f)
    h_prod = sha256(prod_f)
    sz_stg = file_size(staging_f)
    sz_prd = file_size(prod_f)
    if h_stg == h_prod:
        info(f"{staging_f.name}: {YEL}sem alterações{RST} (hash idêntico)")
    else:
        changed = f"{RED}ALTERADO{RST}"
        print(f"  {BOLD}{'─'*48}{RST}")
        print(f"  📄 {BOLD}{staging_f.name}{RST}  [{changed}]")
        print(f"     Staging   →  hash:{h_stg}  tamanho:{sz_stg}")
        print(f"     Produção  →  hash:{h_prod}  tamanho:{sz_prd}")

# ── Promoção ─────────────────────────────────────────────────────────────────
def promover(dry_run=False, force=False):
    header("Promoção Staging → Produção")

    # Valida que a pasta staging existe
    if not STAGING.exists():
        err(f"Pasta 'staging/' não encontrada em {ROOT}")
        sys.exit(1)

    # Identifica quais arquivos serão promovidos
    to_promote = []
    for name in PROD_FILES:
        if name in NEVER_PROMOTE:
            warn(f"'{name}' está na lista de exclusão — ignorado")
            continue
        src = STAGING / name
        dst = ROOT / name
        if not src.exists():
            warn(f"'{name}' não existe em staging/ — ignorado")
            continue
        to_promote.append((src, dst))

    if not to_promote:
        err("Nenhum arquivo para promover.")
        sys.exit(1)

    # Mostra diff antes de qualquer ação
    info("Comparando staging com produção:")
    hr()
    for src, dst in to_promote:
        mostrar_diff(src, dst)
    hr()

    if dry_run:
        warn("Modo DRY-RUN — nenhum arquivo foi alterado.")
        return

    # Confirmação
    if not force:
        resp = input(f"\n{BOLD}  Promover {len(to_promote)} arquivo(s) para produção? [s/N]: {RST}").strip().lower()
        if resp not in ("s", "sim", "y", "yes"):
            warn("Operação cancelada pelo usuário.")
            sys.exit(0)

    # Backup dos arquivos atuais de produção
    print()
    info("Criando backup dos arquivos de produção atual...")
    prod_existentes = [dst for _, dst in to_promote if dst.exists()]
    if prod_existentes:
        bk = fazer_backup(prod_existentes)
        info(f"Backup salvo em: _backups/{bk.name}/")
    else:
        warn("Nenhum arquivo de produção existente para fazer backup.")

    # Cópia efetiva
    print()
    info("Copiando arquivos...")
    hr()
    erros = 0
    for src, dst in to_promote:
        try:
            shutil.copy2(src, dst)
            ok(f"staging/{src.name}  →  {dst.name}  ({file_size(dst)})")
        except Exception as e:
            err(f"Falha ao copiar {src.name}: {e}")
            erros += 1

    hr()
    if erros == 0:
        print(f"\n{GREEN}{BOLD}  ✅ Promoção concluída com sucesso!{RST}")
        print(f"  {BLUE}Lembre-se de:{RST}")
        print(f"     • Atualizar o servidor web / CDN se necessário")
        print(f"     • Notificar a equipe sobre a atualização")
        print(f"     • Registrar o que foi alterado no changelog")
    else:
        print(f"\n{RED}{BOLD}  ⚠ Promoção concluída com {erros} erro(s).{RST}")
        print(f"  Verifique os arquivos acima e repita se necessário.")

# ── Rollback ─────────────────────────────────────────────────────────────────
def rollback():
    header("Rollback — Restaurar versão anterior")
    backups = listar_backups()
    if not backups:
        err("Nenhum backup encontrado em _backups/")
        sys.exit(1)

    print(f"  {BOLD}Backups disponíveis:{RST}\n")
    for i, b in enumerate(backups[:10]):
        info_file = b / "BACKUP_INFO.txt"
        ts_fmt    = b.name.replace("_", " ")[:13].replace("T"," ")
        label     = f"{ts_fmt}  ({', '.join(f.name for f in b.iterdir() if f.suffix in ('.html','.js','.css'))})"
        print(f"  [{i+1}] {label}")

    print()
    try:
        idx = int(input(f"  {BOLD}Escolha o backup para restaurar [1-{min(len(backups),10)}]: {RST}")) - 1
    except ValueError:
        err("Entrada inválida.")
        sys.exit(1)

    if idx < 0 or idx >= len(backups[:10]):
        err("Número fora do intervalo.")
        sys.exit(1)

    chosen = backups[idx]
    print()
    warn(f"Restaurando de: _backups/{chosen.name}/")
    resp = input(f"  {BOLD}Confirma? [s/N]: {RST}").strip().lower()
    if resp not in ("s","sim","y","yes"):
        warn("Cancelado.")
        sys.exit(0)

    # Backup do estado atual antes do rollback
    atuais = [ROOT / f for f in PROD_FILES if (ROOT / f).exists() and f not in NEVER_PROMOTE]
    if atuais:
        bk = fazer_backup(atuais)
        info(f"Estado atual salvo em: _backups/{bk.name}/ antes do rollback")

    print()
    for f in chosen.iterdir():
        if f.suffix in (".html", ".js", ".css"):
            dst = ROOT / f.name
            shutil.copy2(f, dst)
            ok(f"Restaurado: {f.name}")

    print(f"\n{GREEN}{BOLD}  ✅ Rollback concluído!{RST}\n")

# ── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Promove staging → produção")
    parser.add_argument("--force",    action="store_true", help="Não pede confirmação")
    parser.add_argument("--dry-run",  action="store_true", help="Simula sem alterar")
    parser.add_argument("--rollback", action="store_true", help="Restaura backup anterior")
    args = parser.parse_args()

    if args.rollback:
        rollback()
    else:
        promover(dry_run=args.dry_run, force=args.force)
