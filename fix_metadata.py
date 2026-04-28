import onnx
import sys

def add_meta_data(filename, meta_data):
    print(f"Abriendo modelo: {filename}")
    model = onnx.load(filename)
    
    # Limpiar metadatos existentes para evitar duplicados
    for i in range(len(model.metadata_props) - 1, -1, -1):
        model.metadata_props.pop(i)
        
    for key, value in meta_data.items():
        meta = model.metadata_props.add()
        meta.key = key
        meta.value = str(value)
        print(f"  + {key}: {value}")

    onnx.save(model, filename)
    print(f"Modelo guardado exitosamente: {filename}\n")

# 1. Parchear Claude/Daniela (es_AR-daniela-high)
add_meta_data(
    "claude/es_AR-daniela-high.onnx", 
    {
        "model_type": "vits",
        "sample_rate": 22050,
        "language": "es",
        "voice": "daniela"
    }
)

# 2. Parchear Meta MMS (vits-mms-spa)
add_meta_data(
    "vits-mms-spa/model.onnx", 
    {
        "model_type": "vits",
        "sample_rate": 16000,
        "language": "es",
        "comment": "mms"
    }
)

# 3. Parchear Daniela Original (por si acaso)
try:
    add_meta_data(
        "daniela/es_AR-daniela-high.onnx", 
        {
            "model_type": "vits",
            "sample_rate": 22050,
            "language": "es",
            "voice": "daniela"
        }
    )
except:
    pass
