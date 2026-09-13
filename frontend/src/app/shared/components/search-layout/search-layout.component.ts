import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-search-layout',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-layout.component.html',
  styleUrls: ['./search-layout.component.scss']
})
export class SearchLayoutComponent {
  @Input() title: string = 'Search';
  @Input() placeholder: string = 'Search here...';

  @Output() searchEvent = new EventEmitter<string>();

  searchQuery: string = '';

  onSearch(): void {
    this.searchEvent.emit(this.searchQuery);
  }
}
