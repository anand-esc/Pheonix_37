from fastapi import FastAPI

app = FastAPI(title="Phoenix API")


@app.get("/")
def read_root():
    return {"status": "Phoenix API stub running"}
