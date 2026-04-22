from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime
import models, schemas, auth

# ─── Contador de atendimentos ──────────────────────────────────────────────────
def _next_numero(db: Session) -> str:
    from sqlalchemy import func
    ultimo = db.query(func.max(models.Manutencao.numero)).scalar()
    if not ultimo:
        return "001"
    try:
        return str(int(ultimo) + 1).zfill(3)
    except ValueError:
        total = db.query(models.Manutencao).count()
        return str(total + 1).zfill(3)

# ─── Snapshot para o log ───────────────────────────────────────────────────────
def _snapshot(m: models.Manutencao) -> dict:
    return {
        "equipamento":  m.equipamento,
        "localizacao":  m.localizacao,
        "tecnico":      m.tecnico,
        "status":       m.status,
        "problema":     m.problema,
        "solucao":      m.solucao,
        "custo":        m.custo,
        "pecas":        m.pecas,
        "data_inicio":  m.data_inicio.isoformat() if m.data_inicio else None,
        "data_fim":     m.data_fim.isoformat()    if m.data_fim    else None,
    }

# ─── Usuários ──────────────────────────────────────────────────────────────────
def get_user_by_username(db: Session, username: str):
    return db.query(models.Usuario).filter(
        models.Usuario.username == username.lower().strip()
    ).first()

def get_all_users(db: Session):
    return db.query(models.Usuario).order_by(models.Usuario.nome).all()

def authenticate_user(db: Session, username: str, password: str):
    user = get_user_by_username(db, username)
    if not user or not auth.verify_password(password, user.senha_hash):
        return None
    return user

def create_user(db: Session, data: schemas.UserCreate):
    user = models.Usuario(
        username=data.username.lower().strip(),
        nome=data.nome.strip(),
        senha_hash=auth.hash_password(data.senha),
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def delete_user(db: Session, user_id: int) -> bool:
    user = db.query(models.Usuario).filter(models.Usuario.id == user_id).first()
    if not user:
        return False
    db.delete(user)
    db.commit()
    return True

def update_user(db: Session, user_id: int, data):
    user = db.query(models.Usuario).filter(models.Usuario.id == user_id).first()
    if not user:
        return None
    if data.nome     is not None: user.nome     = data.nome.strip()
    if data.username is not None: user.username = data.username.lower().strip()
    if data.role     is not None: user.role     = data.role
    if data.senha    is not None: user.senha_hash = auth.hash_password(data.senha)
    db.commit()
    db.refresh(user)
    return user

# ─── Manutenções ───────────────────────────────────────────────────────────────
def get_manutencoes(db: Session, status=None, localizacao=None, busca=None):
    q = db.query(models.Manutencao)
    if status:
        if status == "abertas":
            q = q.filter(~models.Manutencao.status.in_(["Concluída", "Cancelada"]))
        elif status == "finalizadas":
            q = q.filter(models.Manutencao.status.in_(["Concluída", "Cancelada"]))
        else:
            q = q.filter(models.Manutencao.status == status)
    if localizacao:
        q = q.filter(models.Manutencao.localizacao == localizacao)
    if busca:
        term = f"%{busca}%"
        q = q.filter(or_(
            models.Manutencao.equipamento.ilike(term),
            models.Manutencao.tecnico.ilike(term),
            models.Manutencao.problema.ilike(term),
        ))
    return q.order_by(models.Manutencao.id.desc()).all()

def get_manutencao(db: Session, id: int):
    return db.query(models.Manutencao).filter(models.Manutencao.id == id).first()

def create_manutencao(db: Session, data: schemas.ManutencaoCreate, criado_por: str):
    m = models.Manutencao(
        numero=_next_numero(db),
        criado_por=criado_por,
        data_inicio=data.data_inicio or datetime.utcnow(),
        **{k: v for k, v in data.model_dump().items() if k != "data_inicio"},
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m

def update_manutencao(db: Session, id: int, data: schemas.ManutencaoUpdate, editado_por: str):
    m = get_manutencao(db, id)
    if not m:
        return None

    # Salva snapshot ANTES de alterar
    log = models.EditLog(
        manutencao_id=m.id,
        editado_por=editado_por,
        motivo="Edição manual",
        snapshot=_snapshot(m),
    )
    db.add(log)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(m, field, value)

    db.commit()
    db.refresh(m)
    return m

def finalizar_manutencao(db: Session, id: int, data: schemas.FinalizarRequest, finalizado_por: str):
    m = get_manutencao(db, id)
    if not m:
        return None

    log = models.EditLog(
        manutencao_id=m.id,
        editado_por=finalizado_por,
        motivo="Finalização do atendimento",
        snapshot=_snapshot(m),
    )
    db.add(log)

    m.status             = "Concluída"
    m.resultado_reparo   = data.resultado_reparo
    m.status_equipamento = data.status_equipamento or m.status
    m.data_fim           = datetime.utcnow()
    if data.solucao is not None: m.solucao = data.solucao
    if data.custo   is not None: m.custo   = data.custo
    if data.pecas   is not None: m.pecas   = data.pecas

    db.commit()
    db.refresh(m)
    return m

def delete_manutencao(db: Session, id: int) -> bool:
    m = get_manutencao(db, id)
    if not m:
        return False
    db.delete(m)
    db.commit()
    return True

def get_historico(db: Session, manutencao_id: int):
    return db.query(models.EditLog).filter(
        models.EditLog.manutencao_id == manutencao_id
    ).order_by(models.EditLog.id.desc()).all()

def get_equipamentos_usados(db: Session):
    rows = db.query(models.Manutencao.equipamento).distinct().all()
    return sorted({r[0] for r in rows if r[0]})

# ─── Anexos ────────────────────────────────────────────────────────────────────
def get_anexos(db: Session, manutencao_id: int):
    return db.query(models.Anexo).filter(
        models.Anexo.manutencao_id == manutencao_id
    ).order_by(models.Anexo.id).all()

def create_anexo(db: Session, manutencao_id: int, data: schemas.AnexoCreate):
    anexo = models.Anexo(manutencao_id=manutencao_id, **data.model_dump())
    db.add(anexo)
    db.commit()
    db.refresh(anexo)
    return anexo

def delete_anexo(db: Session, manutencao_id: int, anexo_id: int) -> bool:
    anexo = db.query(models.Anexo).filter(
        models.Anexo.id == anexo_id,
        models.Anexo.manutencao_id == manutencao_id
    ).first()
    if not anexo:
        return False
    db.delete(anexo)
    db.commit()
    return True
