# Study PDF AI

PDF를 읽으면서 AI와 대화하고 공부할 수 있는 데스크톱 학습 도우미입니다.

전체 PDF를 미리 서버로 보내거나 임베딩하지 않습니다. 현재 보고 있는 페이지와 사용자가
정한 앞·뒤 페이지 범위만 AI에 전달하므로, 긴 문서도 빠르게 참고하고 토큰 사용량을 줄일 수
있습니다.

## 주요 기능

- PDF 페이지 뷰어와 독립적으로 스크롤되는 AI 채팅 사이드바
- 현재 페이지 기준 앞·뒤 참고 범위 설정
- 선택한 PDF 텍스트를 질문에 바로 첨부
- OpenAI 및 Google Gemini API 지원
- 수식이 포함된 AI 답변의 Markdown 및 LaTeX 렌더링
- 채팅창 너비, 참고 범위, 화면 비율, 배경색, API 설정 저장
- 최근에 열어 본 PDF 목록에서 원래 파일을 바로 다시 열기
- Windows 설치 파일 형태의 Electron 데스크톱 앱 빌드

## 동작 방식

질문을 보내면 앱은 현재 페이지와 참고 범위에 포함되는 페이지만 텍스트로 추출합니다.
추출한 텍스트와 질문을 AI에 보내고, 답변은 실시간으로 채팅창에 표시합니다. 따라서 PDF 전체를
처음부터 읽어들이는 방식보다 대기 시간과 문맥 비용을 줄일 수 있습니다.

> API 키는 Electron 앱의 사용자 설정 영역에 저장됩니다. 민감한 키가 포함된 `backend/.env`는
> Git에 포함되지 않습니다.

## 준비

Python 백엔드는 별도의 Conda 환경 `pdf-viewer`를 사용합니다.

```powershell
conda env create -f environment.yml
npm install
```

이미 환경을 만든 경우:

```powershell
conda run -n pdf-viewer pip install -e "./backend[dev]"
```

## 개발 실행

```powershell
npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다. 기본 설정은 API 키 없이 작동하는
모의 AI 응답입니다.

실제 AI API는 화면 상단의 `API 설정`에서 OpenAI 또는 Google Gemini를 선택하고
모델과 API 키를 저장하면 됩니다. Gemini는 Google의 OpenAI 호환 엔드포인트를 사용합니다.

환경 파일로 직접 OpenAI 호환 API를 설정하려면 `backend/.env.example`을
`backend/.env`로 복사하고 다음 값을 설정합니다.

```dotenv
LLM_PROVIDER=openai
LLM_API_KEY=...
LLM_MODEL=gpt-4.1-mini
LLM_BASE_URL=https://api.openai.com/v1
```

## 검증

```powershell
npm test
npm run build
conda run -n pdf-viewer pytest backend/tests
conda run -n pdf-viewer ruff check backend
```

## Electron 개발 실행

```powershell
npm run electron:dev
```

현재 Electron 개발 모드는 로컬 FastAPI 서버를 함께 실행합니다. 배포용 빌드에서 Python
백엔드는 sidecar 실행 파일로 포함됩니다.

## Windows 설치 파일 만들기

```powershell
npm run electron:build
```

빌드가 끝나면 `release/Study-PDF-AI-Setup-<version>.exe`가 생성됩니다. `release/` 폴더는
Git에 올리지 않으며, 배포할 설치 파일은 GitHub Releases에 첨부합니다.
