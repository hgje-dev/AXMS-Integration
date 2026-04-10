// 화면 이동(fetch)만 전담하는 라우터
const routes = {
  dashboard: './views/dashboard.html',
  project: './views/project.html',
  request: './views/request.html',
  simulation: './views/simulation.html',
  weekly: './views/weekly.html',
};

export async function initRouter() {
  const content = document.getElementById('content');
  const page = window.location.hash.replace('#', '') || 'dashboard';
  const target = routes[page] || routes.dashboard;

  try {
    const res = await fetch(target);
    const html = await res.text();
    content.innerHTML = html;
  } catch (error) {
    content.innerHTML = '<p>페이지를 불러오지 못했습니다.</p>';
    console.error(error);
  }
}
