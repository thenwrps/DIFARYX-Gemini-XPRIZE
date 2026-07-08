import vertexai
from vertexai.generative_models import GenerativeModel

# 1. เริ่มต้นการเชื่อมต่อ (ระบบจะดึงไฟล์ ADC ในเครื่องมาใช้อัตโนมัติ)
# หมายเหตุ: โมเดลมักจะรันในโซนมาตรฐานอย่าง us-central1 หรือ asia-southeast1
vertexai.init(project="project-5d203db1-ad48-42a6-b3c", location="us-central1")

# 2. เลือกใช้งานโมเดล Gemini 2.5 Flash
model = GenerativeModel(model_name="gemini-2.5-flash")

# 3. ส่งคำสั่ง (Prompt) ทดสอบ
print("กำลังเชื่อมต่อและส่งข้อมูลไปยัง Gemini...")
response = model.generate_content("Reply ONLY with the word SUCCESS")

# 4. แสดงผลลัพธ์
print(f"คำตอบจากเซิร์ฟเวอร์: {response.text}")