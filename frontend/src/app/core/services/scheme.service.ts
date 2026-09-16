import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SchemeService {
  private readonly apiUrl = 'http://localhost:8000/schemes';

  constructor(private http: HttpClient) {}

  createScheme(data: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, data);
  }

  getSchemes(): Observable<any> {
    return this.http.get<any>(this.apiUrl);
  }

  getScheme(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  updateScheme(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, data);
  }

  deleteScheme(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }
}