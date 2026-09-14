import { Component, type ReactNode } from 'react';

export function CustomViewFailure() {
  return <section aria-labelledby="custom-view-error-title">
    <h2 id="custom-view-error-title">사용자 정의 화면을 표시하지 못했습니다.</h2>
    <p>다른 메뉴로 이동하거나 페이지를 새로고침해 주세요.</p>
  </section>;
}

interface Props { children: ReactNode }
interface State { failed: boolean }

export class CustomViewBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? <CustomViewFailure /> : this.props.children;
  }
}
