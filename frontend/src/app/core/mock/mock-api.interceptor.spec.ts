import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { Room } from '../models/chat.models';
import { DemoMode, MOCK_LATENCY, MOCK_STORAGE } from './demo-mode';
import { backendUnavailable, mockApiInterceptor } from './mock-api.interceptor';
import { MOCK_BOTS } from './mock-hub';

describe('mockApiInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let demo: DemoMode;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([mockApiInterceptor])),
        provideHttpClientTesting(),
        { provide: MOCK_LATENCY, useValue: [0, 0] },
        { provide: MOCK_STORAGE, useValue: null },
        { provide: MOCK_BOTS, useValue: false },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    demo = TestBed.inject(DemoMode);
  });

  afterEach(() => backend.verify());

  const rooms = () => firstValueFrom(http.get<Room[]>('/api/rooms'));

  it('uses the real API while it answers', async () => {
    const result = rooms();
    backend.expectOne('/api/rooms').flush([]);
    expect(await result).toEqual([]);
    expect(demo.active()).toBe(false);
  });

  it('passes real API errors through', async () => {
    const result = firstValueFrom(http.get('/api/rooms/9'));
    backend
      .expectOne('/api/rooms/9')
      .flush(
        { detail: 'The room 9 was not found' },
        { status: 404, statusText: 'Not Found', headers: { 'content-type': 'application/json' } },
      );
    await expect(result).rejects.toMatchObject({ status: 404 });
    expect(demo.active()).toBe(false);
  });

  it('switches to demo mode when the server is unreachable', async () => {
    const result = rooms();
    backend.expectOne('/api/rooms').error(new ProgressEvent('error'), { status: 0 });

    expect((await result).length).toBe(5);
    expect(demo.active()).toBe(true);

    // later calls skip the network entirely
    expect((await rooms()).length).toBe(5);
    backend.expectNone('/api/rooms');
  });

  it('answers mock errors as HTTP errors', async () => {
    demo.enable();
    await expect(firstValueFrom(http.get('/api/rooms/42'))).rejects.toMatchObject({
      status: 404,
      error: { detail: 'The room 42 was not found' },
    });
  });

  it('leaves other URLs alone', async () => {
    demo.enable();
    const result = firstValueFrom(http.get('/assets/config.json'));
    backend.expectOne('/assets/config.json').flush({ ok: true });
    expect(await result).toEqual({ ok: true });
  });

  it('only treats missing backends as unavailable', () => {
    expect(backendUnavailable(new HttpErrorResponse({ status: 0 }))).toBe(true);
    expect(backendUnavailable(new HttpErrorResponse({ status: 502 }))).toBe(true);
    // a static host answering 404 with HTML means there is no API
    const html = new HttpHeaders({ 'content-type': 'text/html' });
    expect(backendUnavailable(new HttpErrorResponse({ status: 404, headers: html }))).toBe(true);
    const json = new HttpHeaders({ 'content-type': 'application/json' });
    expect(backendUnavailable(new HttpErrorResponse({ status: 404, headers: json }))).toBe(false);
    expect(backendUnavailable(new HttpErrorResponse({ status: 422, headers: json }))).toBe(false);
  });
});
