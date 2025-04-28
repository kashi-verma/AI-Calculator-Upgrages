from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import base64
import io
from apps.calculator.utils import analyze_image
from schema import ImageData
from PIL import Image

router = APIRouter()

class CalculateRequest(BaseModel):
    image: str
    dict_of_vars: dict

@router.post("/calculate")
async def calculate(data: CalculateRequest):
    try:
        # Decode the image
        image_data = base64.b64decode(data.image.split(",")[1])
        image = Image.open(io.BytesIO(image_data))

        # Analyze the image
        result = analyze_image(image, data.dict_of_vars)
        return {"data": result, "status": "success"}
    except Exception as e:
        print("Error in /calculate endpoint:", str(e))  # Improved error logging
        return {"data": [], "status": "error", "error": str(e)}

@router.post('')
async def run(data: ImageData):
    try:
        print("Received request:", data.dict_of_vars)  # Log incoming data
        image_data = base64.b64decode(data.image.split(",")[1])  # Assumes data:image/png;base64,<data>
        image_bytes = io.BytesIO(image_data)
        image = Image.open(image_bytes)
        responses = analyze_image(image, dict_of_vars=data.dict_of_vars)
        print("Analysis result:", responses)  # Log analysis result
        return {"message": "Image processed", "data": responses, "status": "success"}
    except Exception as e:
        print("Error processing image:", str(e))  # Log the error
        return {"message": "Failed to process the image.", "data": [], "status": "error", "error": str(e)}
