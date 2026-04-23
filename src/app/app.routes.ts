import { Routes } from '@angular/router';
import { GettingStarted } from '../components/getting-started/getting-started';
import { Main } from '../components/main/main';
import { Home } from '../components/home/home';
import { Report } from '../components/report/report';
import { Analytics } from '../components/analytics/analytics';
import { About } from '../components/about/about';


export const routes: Routes = [
    { path: '', component: GettingStarted },
    { 
        path: 'main', 
        component: Main,
        children: [
            { path: '', redirectTo: 'home', pathMatch: 'full' },
            { path: 'home', component: Home },
            { path: 'report', component: Report },
            { path: 'analytics', component: Analytics },
            { path: 'about', component: About }
        ]
    }
];
