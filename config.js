/**
 * KKW 93 Reunion — LIFF Web Application
 * File: config.js — ค่าตั้งต้นฝั่ง frontend (แก้ไฟล์นี้ไฟล์เดียว)
 *
 * ⚠️ ห้าม commit ค่าจริงลง git (ค่าเหล่านี้เป็น public อยู่แล้ว แต่ควรตั้งผ่าน
 *    build/deploy script ในโปรเจกต์จริง)
 */
window.APP_CONFIG = {
  /** LIFF ID จาก LINE Developers Console (สร้างใต้ LINE Login channel) */
  LIFF_ID: '2012050647-grre6Xzn',

  /** URL ของ GAS Web App (ลงท้ายด้วย /exec) */
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycby7V5qblGVq6ac4theZpEJLW327_LK1MPVYER7cWLymQ8Hie1yrCOzOtBMtWiDqoCx2aA/exec',

  /** ราคาบัตร (ต้องตรงกับ CONFIG.TICKET_PRICE ฝั่ง GAS) */
  TICKET_PRICE: 1000,

  /** โครงสร้างโต๊ะ */
  TOTAL_TABLES: 15,
  MAX_SEATS_PER_TABLE: 10,

  /** ขนาดเสื้อที่เปิดให้เลือก */
  JACKET_SIZES: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],

  /** การย่อภาพฝั่ง client (ตาม PRD ข้อ 5 ข้อ 2) */
  MAX_IMAGE_WIDTH: 1200,
  IMAGE_QUALITY: 0.7,
  MIN_IMAGE_QUALITY: 0.3,
  MAX_IMAGE_BYTES: 800 * 1024,

  /** ข้อมูลงานที่แสดงบนหน้าเว็บ */
  EVENT: {
    name: 'KKW 93 REUNION',
    date: '5 ธ.ค. 2569 | 18.00 น.',
    venue: 'โรงแรมขอนแก่นโฮเทล',
    bank: 'SCB 793-283976-3',
    bankName: 'นาย สมเมธ เสียงพราวพันธ์ และ/หรือ นางสาว เกศสุดา จึงวนสุวรรณ และ/หรือ นาย พิชิต'
  }
};
