import { describe, expect, it, vi } from 'vitest';
import { loadPluginMenus } from '../src/plugin-menus';

const menu = { title: '서버', icon: 'server', group: '자산', order: 10, path: '/servers', dataType: 'asset', pluginId: 'sample', sourceId: 'source', list: { columns: [{ key: 'hostname', label: '호스트명', type: 'string' }] } };

describe('plugin menu API client', () => {
  it('검증된 메뉴 배열을 반환한다', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([menu]), { status: 200 }));
    await expect(loadPluginMenus({ request })).resolves.toEqual([menu]);
    expect(request).toHaveBeenCalledWith('/api/v1/plugin-menus', expect.any(Object));
  });

  it('HTTP 실패와 잘못된 응답을 거부한다', async () => {
    await expect(loadPluginMenus({ request: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })) })).rejects.toThrow('plugin_menu_request_failed');
    await expect(loadPluginMenus({ request: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{ ...menu, icon: 'bad' }]), { status: 200 })) })).rejects.toThrow('plugin_menu_invalid_response');
    await expect(loadPluginMenus({ request: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{ ...menu, list: { columns: [] } }]), { status: 200 })) })).rejects.toThrow('plugin_menu_invalid_response');
    await expect(loadPluginMenus({ request: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{ ...menu, list: { columns: [{ key: 'details', label: '상세', type: 'object' }] } }]), { status: 200 })) })).rejects.toThrow('plugin_menu_invalid_response');
  });
});
