from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime

# ─── Auth ──────────────────────────────────────────────────────────────────────
class Token(BaseModel):
    access_token: str
    token_type: str
    nome: str
    username: str
    role: str

# ─── Usuário ───────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username:  str = Field(..., min_length=3, max_length=50)
    nome:      str = Field(..., min_length=2, max_length=100)
    senha:     str = Field(..., min_length=6)
    role:      str = Field("tecnico", pattern="^(tecnico|manutencao|observador|gerencia|admin)$")

class UserOut(BaseModel):
    id:        int
    username:  str
    nome:      str
    role:      str
    criado_em: Optional[datetime]

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    nome:     Optional[str] = None
    username: Optional[str] = None
    senha:    Optional[str] = None
    role:     Optional[str] = None

# ─── Manutenção ────────────────────────────────────────────────────────────────
class ManutencaoCreate(BaseModel):
    equipamento:  str = Field(..., min_length=1)
    localizacao:  Optional[str] = None
    tecnico:      Optional[str] = None
    status:       str = Field("Pendente")
    problema:     str = Field(..., min_length=1)
    solucao:      Optional[str] = None
    custo:        float = 0
    pecas:        Optional[str] = None
    data_inicio:  Optional[datetime] = None
    data_fim:     Optional[datetime] = None

class ManutencaoUpdate(BaseModel):
    equipamento:  Optional[str] = None
    localizacao:  Optional[str] = None
    tecnico:      Optional[str] = None
    status:       Optional[str] = None
    problema:     Optional[str] = None
    solucao:      Optional[str] = None
    custo:        Optional[float] = None
    pecas:        Optional[str] = None
    data_inicio:  Optional[datetime] = None
    data_fim:     Optional[datetime] = None

class FinalizarRequest(BaseModel):
    resultado_reparo:   str = Field(..., pattern="^(Consertado|Sem Reparo)$")
    status_equipamento: Optional[str] = None
    solucao:            Optional[str] = None
    custo:              Optional[float] = None
    pecas:              Optional[str] = None

class ManutencaoOut(BaseModel):
    id:                 int
    numero:             str
    equipamento:        str
    localizacao:        Optional[str]
    tecnico:            Optional[str]
    status:             str
    status_equipamento: Optional[str]
    resultado_reparo:   Optional[str]
    problema:           Optional[str]
    solucao:            Optional[str]
    custo:              float
    pecas:              Optional[str]
    data_inicio:        Optional[datetime]
    data_fim:           Optional[datetime]
    criado_por:         Optional[str]
    criado_em:          Optional[datetime]
    atualizado_em:      Optional[datetime]

    class Config:
        from_attributes = True

# ─── Anexos ────────────────────────────────────────────────────────────────────
class AnexoCreate(BaseModel):
    nome:    str
    tipo:    str
    tamanho: int
    data:    str
    base64:  str

class AnexoOut(BaseModel):
    id:      int
    nome:    str
    tipo:    str
    tamanho: int
    data:    str
    base64:  str

    class Config:
        from_attributes = True

# ─── Log de edições ────────────────────────────────────────────────────────────
class EditLogOut(BaseModel):
    id:           int
    ts:           Optional[datetime]
    editado_por:  Optional[str]
    motivo:       Optional[str]
    snapshot:     Optional[Any]

    class Config:
        from_attributes = True
