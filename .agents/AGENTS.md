# 프로젝트 글로벌 규칙 (Project Global Rules)

이 프로젝트(보라카이 고래상어 투어)는 **UI/UX Pro Max 플러그인이 도출한 "순정 데이터"**를 최우선으로 따릅니다. 
기존의 다크 모드나 자잘한 커스텀 스타일은 금지하며, 오직 아래의 공식 분석 데이터만을 기준으로 모든 페이지를 구축합니다.

## 🤖 Boracay Whale Shark Pure Design System
1. **컬러 팔레트 (Color)**
   - 기본 배경(Background): `#F8FAFC` (라이트 모드 필수, 다크 모드 금지)
   - 메인 색상(Primary): `#2563EB`
   - 강조/버튼(Accent/CTA): `#F97316`
   - 텍스트(Foreground): `#1E293B`
2. **타이포그래피 (Typography)**
   - 폰트 패밀리: `Inter`
   - 특징: 가독성 중심, 명확한 위계, 반응형 폰트 사용(`clamp` 허용이나 레이아웃 파괴 금지)
3. **질감 및 레이아웃 (Glassmorphism)**
   - 박스 모델 뼈대: 맑은 글래스모피즘
   - 질감 처리: `backdrop-filter: blur(15px)`
   - 빛 반사: `border: 1px solid rgba(255, 255, 255, 0.5)` 및 그림자 깊이감 추가
4. **금기 사항 (Avoid)**
   - 과도한 애니메이션(GSAP 등) 금지
   - 화면을 가리는 노이즈 오버레이 금지
   - 어두운 배경(Dark mode by default) 금지
