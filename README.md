# 정치탈탈 (politaltal.com)

제22대 국회의원 의정활동을 공공데이터로 시각화한 민간 정보 플랫폼.

> 본 서비스는 정부·국회·선관위 공식 서비스가 아닙니다.
> 공공데이터(열린국회정보 OpenAPI, 공공누리 제1유형)를 시각화한 민간 플랫폼입니다.

## 배포

- 도메인: https://politaltal.com (메인), https://정치탈탈.com (한글 미러)
- 호스팅: Cloudflare Pages
- 데이터: 열린국회정보 OpenAPI (open.assembly.go.kr)
- 정적 사이트 (HTML/CSS/JS), 286명 의원 페이지 + 인사이트 대시보드

## 빌드 (로컬)

이 저장소는 빌드 산출물(static HTML)만 포함합니다.
원본 소스 + 빌드 스크립트는 별도 비공개 저장소에서 관리됩니다.

데이터 갱신 시:
1. 로컬에서 데이터 수집 + 빌드 (`python3 generate.py`)
2. `site/` 변경분을 이 저장소에 푸시
3. Cloudflare Pages가 자동으로 새 버전 배포

## 데이터 출처

- 의원 정보·발의 법안·표결: [열린국회정보](https://open.assembly.go.kr)
- 사진: 국회 공식 의원 사진 (공공자료)

## 문의

정보 정정 요청: contact@politaltal.com
